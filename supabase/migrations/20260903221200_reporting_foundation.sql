create or replace function public.get_business_report(
  p_start_date date,
  p_end_date date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;

  v_gross_sales numeric := 0;
  v_refunds numeric := 0;
  v_net_sales numeric := 0;

  v_gross_cogs numeric := 0;
  v_returned_cogs numeric := 0;
  v_net_cogs numeric := 0;

  v_gross_profit numeric := 0;
  v_gross_margin numeric := 0;

  v_transaction_count integer := 0;
  v_units_sold integer := 0;
  v_discount_amount numeric := 0;
  v_vat_amount numeric := 0;
  v_average_order_value numeric := 0;

  v_inventory_quantity numeric := 0;
  v_inventory_value numeric := 0;

  v_supplier_outstanding numeric := 0;
  v_supplier_overdue numeric := 0;

  v_sales_trend jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
  v_branch_performance jsonb := '[]'::jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_branch_id is not null then
    select b.organization_id
    into v_organization_id
    from public.branches b
    where b.id = p_branch_id
      and (
        public.is_branch_member(b.id)
        or public.is_org_member(b.organization_id)
      )
    limit 1;

    if v_organization_id is null then
      raise exception 'Branch not found or access denied';
    end if;
  else
    select uo.organization_id
    into v_organization_id
    from public.user_organizations uo
    where uo.user_id = v_user_id
    order by uo.created_at
    limit 1;

    if v_organization_id is null then
      raise exception 'No organization membership found';
    end if;
  end if;

  /*
   * Sales summary.
   *
   * REFUNDED sales remain part of historical gross sales because their
   * returns are reversed separately below. This prevents the original
   * transaction from disappearing from reporting.
   */
  select
    coalesce(sum(s.total_amount), 0),
    count(*),
    coalesce(sum(s.discount_amount), 0),
    coalesce(sum(s.vat_amount), 0)
  into
    v_gross_sales,
    v_transaction_count,
    v_discount_amount,
    v_vat_amount
  from public.sales s
  where s.organization_id = v_organization_id
    and s.status in ('COMPLETED', 'REFUNDED')
    and s.completed_at >= p_start_date::timestamptz
    and s.completed_at < (p_end_date + 1)::timestamptz
    and (
      p_branch_id is null
      or s.branch_id = p_branch_id
    );

  /*
   * Gross COGS and units sold use the cost captured on the original
   * sale item, preserving historical profitability.
   */
  select
    coalesce(sum(si.quantity), 0),
    coalesce(sum(si.quantity * si.unit_cost), 0)
  into
    v_units_sold,
    v_gross_cogs
  from public.sale_items si
  join public.sales s
    on s.id = si.sale_id
  where s.organization_id = v_organization_id
    and s.status in ('COMPLETED', 'REFUNDED')
    and s.completed_at >= p_start_date::timestamptz
    and s.completed_at < (p_end_date + 1)::timestamptz
    and (
      p_branch_id is null
      or s.branch_id = p_branch_id
    );

  /*
   * Completed returns reverse both revenue and the original item's COGS.
   *
   * Returned COGS is reversed whether or not the item was restocked.
   * Gross profit reporting measures the reversal of the original sale;
   * inventory disposition is a separate operational concern.
   */
  select
    coalesce(sum(r.refund_amount), 0)
  into
    v_refunds
  from public.returns r
  where r.organization_id = v_organization_id
    and r.status = 'COMPLETED'
    and coalesce(r.completed_at, r.created_at) >= p_start_date::timestamptz
    and coalesce(r.completed_at, r.created_at) < (p_end_date + 1)::timestamptz
    and (
      p_branch_id is null
      or r.branch_id = p_branch_id
    );

  select
    coalesce(sum(ri.quantity * si.unit_cost), 0)
  into
    v_returned_cogs
  from public.return_items ri
  join public.returns r
    on r.id = ri.return_id
  join public.sale_items si
    on si.id = ri.sale_item_id
  where r.organization_id = v_organization_id
    and r.status = 'COMPLETED'
    and coalesce(r.completed_at, r.created_at) >= p_start_date::timestamptz
    and coalesce(r.completed_at, r.created_at) < (p_end_date + 1)::timestamptz
    and (
      p_branch_id is null
      or r.branch_id = p_branch_id
    );

  v_net_sales := v_gross_sales - v_refunds;
  v_net_cogs := v_gross_cogs - v_returned_cogs;
  v_gross_profit := v_net_sales - v_net_cogs;

  if v_net_sales <> 0 then
    v_gross_margin :=
      round((v_gross_profit / v_net_sales) * 100, 2);
  else
    v_gross_margin := 0;
  end if;

  if v_transaction_count > 0 then
    v_average_order_value :=
      round(v_net_sales / v_transaction_count, 2);
  else
    v_average_order_value := 0;
  end if;

  /*
   * Current inventory position.
   *
   * These figures intentionally represent the current stock position,
   * not historical inventory as at p_end_date.
   */
  select
    coalesce(sum(i.quantity_on_hand), 0),
    coalesce(sum(i.quantity_on_hand * i.average_cost), 0)
  into
    v_inventory_quantity,
    v_inventory_value
  from public.inventory i
  where i.organization_id = v_organization_id
    and (
      p_branch_id is null
      or i.branch_id = p_branch_id
    );

  /*
   * Current accounts payable position.
   *
   * Like inventory, this is a current balance-sheet style position.
   */
  select
    coalesce(sum(si.amount_due), 0),
    coalesce(
      sum(
        case
          when si.due_date < current_date
            and si.amount_due > 0
            and si.status in ('UNPAID', 'PARTIALLY_PAID')
          then si.amount_due
          else 0
        end
      ),
      0
    )
  into
    v_supplier_outstanding,
    v_supplier_overdue
  from public.supplier_invoices si
  where si.organization_id = v_organization_id
    and si.status <> 'CANCELLED'
    and (
      p_branch_id is null
      or si.branch_id = p_branch_id
    );

  /*
   * Daily sales trend.
   *
   * Returns are grouped by the date on which the return was completed,
   * so the report reflects the business activity of each day.
   */
  with date_series as (
    select generate_series(
      p_start_date,
      p_end_date,
      interval '1 day'
    )::date as report_date
  ),
  daily_sales as (
    select
      s.completed_at::date as report_date,
      coalesce(sum(s.total_amount), 0) as gross_sales,
      count(*) as transactions,
      coalesce(
        sum(
          (
            select coalesce(
              sum(si.quantity * si.unit_cost),
              0
            )
            from public.sale_items si
            where si.sale_id = s.id
          )
        ),
        0
      ) as gross_cogs
    from public.sales s
    where s.organization_id = v_organization_id
      and s.status in ('COMPLETED', 'REFUNDED')
      and s.completed_at >= p_start_date::timestamptz
      and s.completed_at < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or s.branch_id = p_branch_id
      )
    group by s.completed_at::date
  ),
  daily_returns as (
    select
      coalesce(r.completed_at, r.created_at)::date as report_date,
      coalesce(sum(r.refund_amount), 0) as refunds,
      coalesce(
        sum(ri.quantity * si.unit_cost),
        0
      ) as returned_cogs
    from public.returns r
    join public.return_items ri
      on ri.return_id = r.id
    join public.sale_items si
      on si.id = ri.sale_item_id
    where r.organization_id = v_organization_id
      and r.status = 'COMPLETED'
      and coalesce(r.completed_at, r.created_at)
        >= p_start_date::timestamptz
      and coalesce(r.completed_at, r.created_at)
        < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or r.branch_id = p_branch_id
      )
    group by coalesce(r.completed_at, r.created_at)::date
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', ds.report_date,
        'gross_sales', round(coalesce(s.gross_sales, 0), 2),
        'refunds', round(coalesce(r.refunds, 0), 2),
        'net_sales',
          round(
            coalesce(s.gross_sales, 0)
            - coalesce(r.refunds, 0),
            2
          ),
        'cogs',
          round(
            coalesce(s.gross_cogs, 0)
            - coalesce(r.returned_cogs, 0),
            2
          ),
        'gross_profit',
          round(
            (
              coalesce(s.gross_sales, 0)
              - coalesce(r.refunds, 0)
            )
            -
            (
              coalesce(s.gross_cogs, 0)
              - coalesce(r.returned_cogs, 0)
            ),
            2
          ),
        'transactions', coalesce(s.transactions, 0)
      )
      order by ds.report_date
    ),
    '[]'::jsonb
  )
  into v_sales_trend
  from date_series ds
  left join daily_sales s
    on s.report_date = ds.report_date
  left join daily_returns r
    on r.report_date = ds.report_date;

  /*
   * Top products.
   *
   * Returned quantities, revenue and original COGS are deducted from
   * the product that generated the original sale.
   */
  with product_sales as (
    select
      si.product_id,
      sum(si.quantity) as units_sold,
      sum(si.line_total) as gross_revenue,
      sum(si.quantity * si.unit_cost) as gross_cogs
    from public.sale_items si
    join public.sales s
      on s.id = si.sale_id
    where s.organization_id = v_organization_id
      and s.status in ('COMPLETED', 'REFUNDED')
      and s.completed_at >= p_start_date::timestamptz
      and s.completed_at < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or s.branch_id = p_branch_id
      )
    group by si.product_id
  ),
  product_returns as (
    select
      ri.product_id,
      sum(ri.quantity) as returned_units,
      sum(ri.line_refund_amount) as refunded_revenue,
      sum(ri.quantity * si.unit_cost) as returned_cogs
    from public.return_items ri
    join public.returns r
      on r.id = ri.return_id
    join public.sale_items si
      on si.id = ri.sale_item_id
    where r.organization_id = v_organization_id
      and r.status = 'COMPLETED'
      and coalesce(r.completed_at, r.created_at)
        >= p_start_date::timestamptz
      and coalesce(r.completed_at, r.created_at)
        < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or r.branch_id = p_branch_id
      )
    group by ri.product_id
  ),
  product_report as (
    select
      ps.product_id,
      p.name as product_name,
      p.sku,
      ps.units_sold - coalesce(pr.returned_units, 0) as net_units,
      ps.gross_revenue
        - coalesce(pr.refunded_revenue, 0) as revenue,
      ps.gross_cogs
        - coalesce(pr.returned_cogs, 0) as cogs
    from product_sales ps
    join public.products p
      on p.id = ps.product_id
    left join product_returns pr
      on pr.product_id = ps.product_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', ranked.product_id,
        'product_name', ranked.product_name,
        'sku', ranked.sku,
        'units_sold', ranked.net_units,
        'revenue', round(ranked.revenue, 2),
        'cogs', round(ranked.cogs, 2),
        'gross_profit',
          round(ranked.revenue - ranked.cogs, 2),
        'gross_margin',
          case
            when ranked.revenue <> 0 then
              round(
                (
                  (ranked.revenue - ranked.cogs)
                  / ranked.revenue
                ) * 100,
                2
              )
            else 0
          end
      )
      order by ranked.revenue desc
    ),
    '[]'::jsonb
  )
  into v_top_products
  from (
    select *
    from product_report
    order by revenue desc
    limit 10
  ) ranked;

  /*
   * Branch performance.
   */
  with branch_sales as (
    select
      s.branch_id,
      count(*) as transactions,
      sum(s.total_amount) as gross_sales,
      coalesce(
        sum(
          (
            select coalesce(
              sum(si.quantity * si.unit_cost),
              0
            )
            from public.sale_items si
            where si.sale_id = s.id
          )
        ),
        0
      ) as gross_cogs
    from public.sales s
    where s.organization_id = v_organization_id
      and s.status in ('COMPLETED', 'REFUNDED')
      and s.completed_at >= p_start_date::timestamptz
      and s.completed_at < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or s.branch_id = p_branch_id
      )
    group by s.branch_id
  ),
  branch_returns as (
    select
      r.branch_id,
      sum(r.refund_amount) as refunds,
      sum(ri.quantity * si.unit_cost) as returned_cogs
    from public.returns r
    join public.return_items ri
      on ri.return_id = r.id
    join public.sale_items si
      on si.id = ri.sale_item_id
    where r.organization_id = v_organization_id
      and r.status = 'COMPLETED'
      and coalesce(r.completed_at, r.created_at)
        >= p_start_date::timestamptz
      and coalesce(r.completed_at, r.created_at)
        < (p_end_date + 1)::timestamptz
      and (
        p_branch_id is null
        or r.branch_id = p_branch_id
      )
    group by r.branch_id
  ),
  branch_report as (
    select
      bs.branch_id,
      b.name as branch_name,
      bs.transactions,
      bs.gross_sales
        - coalesce(br.refunds, 0) as net_sales,
      bs.gross_cogs
        - coalesce(br.returned_cogs, 0) as net_cogs
    from branch_sales bs
    join public.branches b
      on b.id = bs.branch_id
    left join branch_returns br
      on br.branch_id = bs.branch_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'branch_id', br.branch_id,
        'branch_name', br.branch_name,
        'transactions', br.transactions,
        'net_sales', round(br.net_sales, 2),
        'cogs', round(br.net_cogs, 2),
        'gross_profit',
          round(br.net_sales - br.net_cogs, 2),
        'gross_margin',
          case
            when br.net_sales <> 0 then
              round(
                (
                  (br.net_sales - br.net_cogs)
                  / br.net_sales
                ) * 100,
                2
              )
            else 0
          end
      )
      order by br.net_sales desc
    ),
    '[]'::jsonb
  )
  into v_branch_performance
  from branch_report br;

  return jsonb_build_object(
    'period',
      jsonb_build_object(
        'start_date', p_start_date,
        'end_date', p_end_date,
        'branch_id', p_branch_id
      ),

    'summary',
      jsonb_build_object(
        'gross_sales', round(v_gross_sales, 2),
        'refunds', round(v_refunds, 2),
        'net_sales', round(v_net_sales, 2),
        'gross_cogs', round(v_gross_cogs, 2),
        'returned_cogs', round(v_returned_cogs, 2),
        'net_cogs', round(v_net_cogs, 2),
        'gross_profit', round(v_gross_profit, 2),
        'gross_margin', round(v_gross_margin, 2),
        'transaction_count', v_transaction_count,
        'units_sold', v_units_sold,
        'discount_amount', round(v_discount_amount, 2),
        'vat_amount', round(v_vat_amount, 2),
        'average_order_value', round(v_average_order_value, 2)
      ),

    'business_position',
      jsonb_build_object(
        'inventory_quantity', v_inventory_quantity,
        'inventory_value', round(v_inventory_value, 2),
        'supplier_outstanding',
          round(v_supplier_outstanding, 2),
        'supplier_overdue',
          round(v_supplier_overdue, 2)
      ),

    'sales_trend', v_sales_trend,
    'top_products', v_top_products,
    'branch_performance', v_branch_performance
  );
end;
$$;

revoke all
on function public.get_business_report(date, date, uuid)
from public;

grant execute
on function public.get_business_report(date, date, uuid)
to authenticated;