# EduRoute location privacy

EduRoute does not provide live employee movement monitoring. HRMU, ISSU/IS, administrators, deans, and other users receive trip status and official verification records only.

Faculty route guidance uses the browser Geolocation API locally on the employee device. The current position may be used to request a Mapbox route to the declared destination or campus return point, and the route can be refreshed as the employee moves. Current coordinates are not broadcast through Socket.IO, written to continuous trip-location logs, or returned to monitoring dashboards.

Official records remain event-based: locator slip approval, exit verification, trip start/status changes, proof of compliance submission, return-entry verification, and completion timestamps. Existing location-log tables are retained for migration safety and historical data, but new live location routes and broadcasts are disabled.
