// A generation counter also invalidates A -> B -> A transitions and dialog closure.
export function createExportSession() {
  let generation = 0;
  return {
    invalidate() { generation++; },
    start() {
      const started = ++generation;
      return () => {
        if (started !== generation) throw new Error("Workspace or export selection changed. Please start a new export.");
      };
    },
  };
}
