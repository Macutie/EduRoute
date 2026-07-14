const env = require('../config/env');
const AppError = require('../utils/appError');

const VALID_PROFILES = new Set([
    'mapbox/driving',
    'mapbox/driving-traffic',
    'mapbox/walking',
    'mapbox/cycling'
]);

const DEFAULT_GEOCODING_TYPES = 'country,region,postcode,district,place,locality,neighborhood,address';

const searchDestinations = async (query, options = {}) => {
    if (!env.mapboxSecretToken) {
        throw new AppError('Mapbox secret token is not configured.', 500);
    }

    const searchText = String(query || '').trim();

    if (searchText.length < 2) {
        return [];
    }

    const url = new URL(`https://api.mapbox.com/search/geocode/v6/forward`);
    url.searchParams.set('access_token', env.mapboxSecretToken);
    url.searchParams.set('q', searchText);
    url.searchParams.set('limit', String(options.limit || 5));
    url.searchParams.set('language', options.language || 'en');
    url.searchParams.set('country', options.country || 'PH');
    url.searchParams.set('types', options.types || DEFAULT_GEOCODING_TYPES);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new AppError(data.message || 'Unable to search destinations from Mapbox.', response.status || 502);
    }

    return (data.features || []).map((feature) => ({
        id: feature.id,
        name: feature.properties?.name || feature.properties?.full_address || 'Unknown destination',
        full_address: feature.properties?.full_address || feature.properties?.place_formatted || feature.properties?.name || 'Unknown destination',
        coordinates: {
            lng: feature.geometry?.coordinates?.[0],
            lat: feature.geometry?.coordinates?.[1]
        },
        feature
    }));
};

const assertCoordinate = (coordinate, label) => {
    const longitude = Number(coordinate?.longitude ?? coordinate?.lng);
    const latitude = Number(coordinate?.latitude ?? coordinate?.lat);

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new AppError(`${label} longitude is invalid.`, 422);
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new AppError(`${label} latitude is invalid.`, 422);
    }

    return {
        lng: longitude,
        lat: latitude
    };
};

const normalizeRoute = (routeProfile, route) => ({
    profile: routeProfile,
    distance_meters: route.distance,
    duration_seconds: route.duration,
    summary: route.legs?.map((leg) => leg.summary).filter(Boolean).join(' • ') || '',
    geometry: route.geometry,
    waypoints: route.waypoints || [],
    legs: route.legs || [],
    steps: (route.legs || []).flatMap((leg) =>
        (leg.steps || []).map((step) => ({
            distance_meters: step.distance,
            duration_seconds: step.duration,
            instruction: step.maneuver?.instruction || '',
            modifier: step.maneuver?.modifier || '',
            type: step.maneuver?.type || '',
            name: step.name || '',
            location: step.maneuver?.location || [],
            geometry: step.geometry || null
        }))
    )
});

const getDirections = async ({ origin, destination, profile, alternatives = false }) => {
    if (!env.mapboxSecretToken) {
        throw new AppError('Mapbox secret token is not configured.', 500);
    }

    const safeOrigin = assertCoordinate(origin, 'Origin');
    const safeDestination = assertCoordinate(destination, 'Destination');
    const routeProfile = VALID_PROFILES.has(profile) ? profile : env.mapboxDirectionsProfile;
    const coordinates = `${safeOrigin.lng},${safeOrigin.lat};${safeDestination.lng},${safeDestination.lat}`;
    const url = new URL(`https://api.mapbox.com/directions/v5/${routeProfile}/${coordinates}`);

    url.searchParams.set('access_token', env.mapboxSecretToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('alternatives', alternatives ? 'true' : 'false');

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.code !== 'Ok' || !data.routes?.[0]) {
        throw new AppError(data.message || 'Unable to generate route from Mapbox.', response.status || 502);
    }

    const routes = [...(data.routes || [])].sort((firstRoute, secondRoute) => firstRoute.duration - secondRoute.duration);
    const primaryRoute = routes[0];

    return {
        ...normalizeRoute(routeProfile, primaryRoute),
        waypoints: data.waypoints || [],
        alternatives: routes.slice(1, 3).map((route) => normalizeRoute(routeProfile, route))
    };
};

module.exports = {
    assertCoordinate,
    getDirections,
    searchDestinations,
    DEFAULT_GEOCODING_TYPES
};
