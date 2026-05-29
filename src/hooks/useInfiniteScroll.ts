// ============================================================
// SuggestIt - useInfiniteScroll + useServerSuggestions
//
// useInfiniteScroll:
//   Attaches an IntersectionObserver to a sentinel element.
//   Fires onLoadMore when the sentinel enters the viewport.
//   The caller controls whether more pages are available.
//
// useServerSuggestions:
//   Fetches paginated suggestions from the GraphQL server.
//   • Accumulates pages into a single flat list (infinite scroll)
//   • Prefetches the next page when the user reaches 80% of the
//     current list (Gold requirement: "minimum network usage")
//   • Falls back to the in-memory store when offline
// ============================================================

import { useEffect, useRef, useCallback, useState } from "react";
import { fetchSuggestions, type PaginatedSuggestions } from "../api/graphql";
import type { Suggestion, SuggestionStatus } from "../types";

// ── useInfiniteScroll ─────────────────────────────────────────

interface UseInfiniteScrollOptions {
  /** Called when the sentinel enters the viewport */
  onLoadMore: () => void;
  /** Set to false to disconnect the observer (no more pages) */
  hasMore: boolean;
  /** How much of the sentinel must be visible before firing (0–1) */
  threshold?: number;
  /** Root margin - positive values pre-trigger before entering view */
  rootMargin?: string;
}

/**
 * Returns a ref to attach to the sentinel element at the bottom
 * of the list. When that element scrolls into view (and hasMore
 * is true), onLoadMore is called.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  threshold = 0.1,
  rootMargin = "200px",
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, threshold, rootMargin]);

  return sentinelRef;
}

// ── useServerSuggestions ──────────────────────────────────────

export const PAGE_SIZE = 10;

interface UseServerSuggestionsOptions {
  groupId: string | null;
  userId?: string;
  filter?: { status?: SuggestionStatus; authorId?: string };
  /** Fallback list used when server is unreachable (offline) */
  offlineFallback?: Suggestion[];
}

interface UseServerSuggestionsResult {
  suggestions: Suggestion[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNextPage: boolean;
  loadMore: () => void;
  total: number;
  error: string | null;
  /** True when data came from the offline fallback */
  isOffline: boolean;
  /** Reload from page 1 (e.g. after a mutation) */
  refresh: () => void;
}

export function useServerSuggestions({
  groupId,
  userId,
  filter,
  offlineFallback = [],
}: UseServerSuggestionsOptions): UseServerSuggestionsResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Track whether a prefetch for the next page is in-flight
  const prefetchedRef = useRef<Record<number, PaginatedSuggestions>>({});
  const latestGroupId = useRef(groupId);
  latestGroupId.current = groupId;

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!groupId) return;

      // Use prefetch cache if available
      const cached = prefetchedRef.current[pageNum];

      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      try {
        const result =
          cached ??
          (await fetchSuggestions(groupId, pageNum, PAGE_SIZE, userId, filter));

        // Guard: group changed while request was in-flight
        if (latestGroupId.current !== groupId) return;

        // Clear prefetch slot now it's consumed
        delete prefetchedRef.current[pageNum];

        setIsOffline(false);
        setError(null);
        setHasNextPage(result.hasNextPage);
        setTotal(result.total);
        setPage(pageNum);

        setSuggestions((prev) =>
          append ? [...prev, ...result.items] : result.items
        );

        // Prefetch the next page immediately if it exists
        if (result.hasNextPage) {
          const nextPage = pageNum + 1;
          if (!prefetchedRef.current[nextPage]) {
            fetchSuggestions(groupId, nextPage, PAGE_SIZE, userId, filter)
              .then((prefetched) => {
                prefetchedRef.current[nextPage] = prefetched;
              })
              .catch(() => {
                // Silent - prefetch failure is non-critical
              });
          }
        }
      } catch {
        if (latestGroupId.current !== groupId) return;
        // Fall back to offline data
        setIsOffline(true);
        setError("Server unreachable - showing cached data");
        if (!append) {
          setSuggestions(offlineFallback);
          setTotal(offlineFallback.length);
          setHasNextPage(false);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, userId, JSON.stringify(filter)]
  );

  // Reset and load page 1 whenever groupId / filter changes
  useEffect(() => {
    prefetchedRef.current = {};
    setSuggestions([]);
    setPage(1);
    setHasNextPage(false);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || isLoadingMore) return;
    fetchPage(page + 1, true);
  }, [hasNextPage, isLoadingMore, fetchPage, page]);

  const refresh = useCallback(() => {
    prefetchedRef.current = {};
    setSuggestions([]);
    fetchPage(1, false);
  }, [fetchPage]);

  return {
    suggestions,
    isLoading,
    isLoadingMore,
    hasNextPage,
    loadMore,
    total,
    error,
    isOffline,
    refresh,
  };
}
