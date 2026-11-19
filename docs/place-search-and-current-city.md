# Place search and current city

Saved app places are searched as you type. Press **Search places** to search
Photon/OpenStreetMap first. If it returns no results or is unavailable, the backend
tries Google Places Text Search (New), when configured. Nonempty OSM results do
not trigger Google, even if the desired business is absent. Searches use the
selected city's surrounding area, not administrative boundaries. City searches
and current-city detection remain on OSM.

Google results appear in a list with attribution, with no OSM map displayed.
Selecting one saves its Google place ID plus your own bookmark label and note.
Google names, addresses, and coordinates are not persisted. These bookmarks
appear in saved-place lists and open in Google Maps; they have no OSM map pin.
Google search responses stay in memory; only result IDs and the app city ID are
cached for 15 minutes to validate saves. OSM results retain their existing cache
and import behavior. See Google's [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## Backend setup (not deployed by this change)

1. Apply the existing maps migration, then
   `supabase/migrations/202611190001_google_places_fallback.sql` to the intended
   Supabase project. Deploy the migration before the updated app: place queries
   now include `google_place_id`.
2. In Google Cloud, enable billing and **Places API (New)**. Create a dedicated
   server API key restricted to Places API (New). Never put it in an
   `EXPO_PUBLIC_*` variable or commit it. Configure these in Supabase's Edge
   Function secrets dashboard:

   ```text
   MAPS_SEARCH_ENABLED=true
   GOOGLE_PLACES_ENABLED=true
   GOOGLE_PLACES_API_KEY=<server key>
   GOOGLE_PLACES_MONTHLY_LIMIT=4500
   ```

3. Deploy the function to the intended linked project:

   ```sh
   npx supabase functions deploy search-locations
   ```

4. Verify an OSM match, an OSM miss with Google success, no matches from either,
   rejected API credentials, and an exhausted budget. Save a Google bookmark,
   reopen it, and test its Google Maps link. Verify attribution on a phone.

Set `GOOGLE_PLACES_ENABLED=false` to disable fallback. Missing credentials or
provider/budget failures leave custom places available and show a notice.

The atomic server counter reserves each Google request before sending it,
including failed requests. It resets by calendar month in America/Los_Angeles.
The configurable cap is 1–5,000; invalid values disable Google calls. It limits
this deployment only: other projects or API keys on the billing account can
consume the same free allowance. It is not a Google billing-account spending cap.
No automatic pagination, details, photos, or ratings requests are made. Review
Google Cloud quotas and billing alerts, and publish the required app terms/privacy
policy before release. Check applicable Google terms for the billing region.

## Current city

Use current city requests foreground location once with the lowest requested
accuracy. Devices may still supply a precise fix; the client rounds it to a
0.1-degree grid before sending it. The server rounds again, requests nearby
settlements, and stores city results under a hashed lookup key. No device position
is saved in profiles or trips. Users confirm a city because nearby settlement
search can choose a neighboring city, especially near borders. No background
location subscription is used.

PHOTON_URL must end in /api/ or /api; reverse lookup uses the same host/prefix
with /reverse. Default: https://photon.komoot.io/api/.

Rebuild native apps to pick up the revised expo-location permission explanation;
existing ios projects may require syncing Expo config first. Test permission
acceptance, denial, timeouts, and city confirmation on web and a physical device.
