export const LIST_PAGE_SIZE = 100;

export type PageSlice<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
  start: number;
  end: number;
};

/** A single source of truth for every bounded master-list view. */
export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = LIST_PAGE_SIZE): PageSlice<T> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > LIST_PAGE_SIZE) {
    throw new Error(`Page size must be an integer from 1 to ${LIST_PAGE_SIZE}.`);
  }
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const finitePage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0;
  const page = Math.min(Math.max(finitePage, 0), pages - 1);
  const offset = page * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    page,
    pages,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(total, offset + pageSize),
  };
}

export function pageContaining<T>(items: readonly T[], predicate: (item: T) => boolean, pageSize = LIST_PAGE_SIZE): number {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > LIST_PAGE_SIZE) {
    throw new Error(`Page size must be an integer from 1 to ${LIST_PAGE_SIZE}.`);
  }
  const index = items.findIndex(predicate);
  return index < 0 ? 0 : Math.floor(index / pageSize);
}
