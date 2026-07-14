const env = require('../config/env');
const AppError = require('../utils/appError');

const normalizeMapboxFeature = (feature) => ({
    id: feature.id,
    label:
        feature.properties?.full_address ||
        feature.properties?.name ||
        feature.place_name ||
        'Unknown destination',
    address:
        feature.properties?.full_address ||
        feature.place_name ||
        feature.properties?.name ||
        'Unknown destination',
    lng: Number(feature.geometry?.coordinates?.[0]),
    lat: Number(feature.geometry?.coordinates?.[1]),
    placeType: feature.properties?.feature_type || feature.place_type?.[0] || ''
});

const searchDestinations = async (rawQuery) => {
    const query = String(rawQuery || '').trim().replace(/\s+/g, ' ');

    if (!query) {
        throw new AppError('Search query is required.', 422);
    }

    if (query.length < 3) {
        throw new AppError('Search query must be at least 3 characters.', 422);
    }

    if (!env.mapboxSecretToken) {
        throw new AppError('Mapbox secret token is not configured.', 500);
    }

    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', query);
    url.searchParams.set('access_token', env.mapboxSecretToken);
    url.searchParams.set('limit', '6');
    url.searchParams.set('autocomplete', 'true');
    url.searchParams.set('country', 'PH');
    url.searchParams.set('language', 'en');
    url.searchParams.set('types', 'address,place,locality,neighborhood,postcode,district,region');

    const response = await fetch(url);
    const data = await response.json();

    if (response.status === 429) {
        throw new AppError('Destination search is temporarily rate-limited. Please wait a moment and try again.', 429);
    }

    if (!response.ok) {
        throw new AppError(data?.message || 'Mapbox destination search failed.', response.status || 502);
    }

    return (data.features || [])
        .map(normalizeMapboxFeature)
        .filter((result) => Number.isFinite(result.lng) && Number.isFinite(result.lat));
};

module.exports = {
    searchDestinations
};
