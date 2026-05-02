import { useEffect, useRef, useState } from 'react';
import { searchDestinationsApi } from '../services/tripApi';

const CACHE_LIMIT = 8;

export const useDestinationSearch = ({ token, debounceMs = 400, minLength = 3, onDestinationSelected } = {}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const cacheRef = useRef(new Map());
  const lastIssuedQueryRef = useRef('');
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const hasSelectedCurrentValue =
      selectedDestination &&
      normalizedQuery &&
      normalizedQuery === (selectedDestination.label || selectedDestination.address || '');

    if (!token || !isFocused || hasSelectedCurrentValue || normalizedQuery.length < minLength) {
      abortControllerRef.current?.abort();
      setResults([]);
      setLoading(false);
      setHighlightedIndex(-1);
      return undefined;
    }

    if (normalizedQuery === lastIssuedQueryRef.current && results.length) {
      return undefined;
    }

    const cachedResults = cacheRef.current.get(normalizedQuery.toLowerCase());
    if (cachedResults) {
      setResults(cachedResults);
      setHighlightedIndex(cachedResults.length ? 0 : -1);
      setLoading(false);
      setError('');
      lastIssuedQueryRef.current = normalizedQuery;
      return undefined;
    }

    const timer = setTimeout(async () => {
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      abortControllerRef.current?.abort();
      const nextAbortController = new AbortController();
      abortControllerRef.current = nextAbortController;

      try {
        setLoading(true);
        setError('');
        const nextResults = await searchDestinationsApi({
          token,
          query: normalizedQuery,
          signal: nextAbortController.signal,
        });

        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        cacheRef.current.set(normalizedQuery.toLowerCase(), nextResults);
        while (cacheRef.current.size > CACHE_LIMIT) {
          const oldestKey = cacheRef.current.keys().next().value;
          cacheRef.current.delete(oldestKey);
        }

        lastIssuedQueryRef.current = normalizedQuery;
        setResults(nextResults);
        setHighlightedIndex(nextResults.length ? 0 : -1);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return;
        setError(fetchError.message);
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [token, query, debounceMs, minLength, isFocused, selectedDestination]);

  const selectDestination = (destination) => {
    setSelectedDestination(destination);
    setQuery(destination?.label || destination?.address || '');
    setResults([]);
    setError('');
    setHighlightedIndex(-1);
    setIsFocused(false);
    onDestinationSelected?.(destination);
  };

  const handleQueryChange = (nextValue) => {
    setQuery(nextValue);
    setError('');
    setHighlightedIndex(-1);
    if (selectedDestination && nextValue !== (selectedDestination.label || selectedDestination.address || '')) {
      setSelectedDestination(null);
    }
    if (nextValue.trim().length < minLength) {
      setResults([]);
    }
  };

  const moveHighlight = (direction) => {
    if (!results.length) return;

    setHighlightedIndex((currentIndex) => {
      if (direction === 'down') {
        return currentIndex >= results.length - 1 ? 0 : currentIndex + 1;
      }

      return currentIndex <= 0 ? results.length - 1 : currentIndex - 1;
    });
  };

  const confirmHighlighted = () => {
    if (highlightedIndex < 0 || !results[highlightedIndex]) return null;
    selectDestination(results[highlightedIndex]);
    return results[highlightedIndex];
  };

  const clearDestination = () => {
    setSelectedDestination(null);
    setResults([]);
    setQuery('');
    setError('');
    setHighlightedIndex(-1);
    setIsFocused(false);
  };

  const clearSuggestions = () => {
    setResults([]);
    setHighlightedIndex(-1);
  };

  return {
    query,
    setQuery: handleQueryChange,
    results,
    selectedDestination,
    selectDestination,
    clearDestination,
    clearSuggestions,
    isFocused,
    setIsFocused,
    highlightedIndex,
    setHighlightedIndex,
    moveHighlight,
    confirmHighlighted,
    isEmpty: isFocused && query.trim().length >= minLength && !loading && !error && results.length === 0,
    loading,
    error,
  };
};
