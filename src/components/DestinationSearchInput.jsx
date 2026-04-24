import { useEffect, useRef } from 'react';
import { useDestinationSearch } from '../hooks/useDestinationSearch';

export const DestinationSearchInput = ({
  token,
  placeholder = 'Search destination...',
  onDestinationSelected,
  onDestinationCoordinatesResolved,
}) => {
  const containerRef = useRef(null);
  const {
    query,
    setQuery,
    results,
    selectDestination,
    loading,
    error,
    isEmpty,
    isFocused,
    setIsFocused,
    highlightedIndex,
    setHighlightedIndex,
    moveHighlight,
    confirmHighlighted,
    selectedDestination,
    clearSuggestions,
  } = useDestinationSearch({
    token,
    onDestinationSelected: (destination) => {
      onDestinationSelected?.(destination);
      onDestinationCoordinatesResolved?.({ lng: destination.lng, lat: destination.lat });
    },
  });

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsFocused(false);
        clearSuggestions();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [clearSuggestions, setIsFocused]);

  const handleKeyDown = (event) => {
    if (!isFocused) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight('down');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight('up');
      return;
    }

    if (event.key === 'Enter') {
      if (results.length) {
        event.preventDefault();
        confirmHighlighted();
      }
      return;
    }

    if (event.key === 'Escape') {
      clearSuggestions();
      setIsFocused(false);
    }
  };

  return (
    <div className="destination-search" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-expanded={isFocused && !!results.length}
        aria-autocomplete="list"
      />

      {selectedDestination && (
        <p className="trip-selected-destination">
          {selectedDestination.label}
          {selectedDestination.placeType ? ` • ${selectedDestination.placeType}` : ''}
        </p>
      )}

      {isFocused && (
        <>
          {loading && <p className="trip-search-state">Searching destinations...</p>}
          {error && <p className="trip-search-state error">{error}</p>}
          {isEmpty && <p className="trip-search-state">No destinations matched your search.</p>}

          {!!results.length && (
            <div className="trip-search-results" role="listbox">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  type="button"
                  className={`trip-search-result ${highlightedIndex === index ? 'active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDestination(result)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <strong>{result.label}</strong>
                  <span>{result.address}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
