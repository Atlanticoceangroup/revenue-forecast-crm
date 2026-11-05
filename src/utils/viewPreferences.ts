export function readPageSize(): number {
  try {
    const value = Number(localStorage.getItem("crm-view-page-size"));
    return [10, 20, 50].includes(value) ? value : 10;
  } catch { return 10; }
}

export function savePageSize(value: number) {
  try { localStorage.setItem("crm-view-page-size", String(value)); } catch { /* A preferência não impede o uso. */ }
}
