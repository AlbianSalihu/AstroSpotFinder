# AstroSpotFinder

AstroSpotFinder is an open-source application for discovering suitable astronomy observation spots.

The long-term goal is to help users find locations based on multiple geographic, practical, environmental,
and astronomical criteria, such as:

- travel time from a starting location;
- walking distance from a parking area;
- altitude and terrain slope;
- surrounding obstacles and horizon visibility;
- light pollution;
- weather conditions;
- Moon position and brightness;
- visibility of astronomical targets;
- local access restrictions.

The project is being developed incrementally. Each feature remains modular, reusable, and independent
from unrelated parts of the application.

---

## Installation

AstroSpotFinder uses [pixi](https://prefix.dev/docs/pixi/overview) for environment and dependency management.

Install dependencies:

```bash
pixi install
```

Start the server:

```bash
pixi run start
```

The application opens automatically at:

```
http://127.0.0.1:8000
```

Stop the server with `Ctrl+C`.

---

## Features currently implemented

### Interactive map

- Interactive OpenStreetMap base map rendered with MapLibre GL JS.
- Click anywhere on the map to place a pin at that location.

### Pin management

- Pins can be placed by clicking the map or by using address search.
- Each pin has an editable label.
- Pins are saved to `data/pins.geojson` and restored on reload.

### Address search

- Type an address in the search box (minimum 3 characters, 1-second debounce).
- Results come from Nominatim (OpenStreetMap geocoding).
- Selecting a result highlights its bounding box on the map and places a pin.

### Isochrone computation

- Given a starting pin, computes a reachable area polygon for a configurable travel time (minutes).
- Supports driving and walking modes.
- Isochrone calculation is performed by a local Valhalla routing engine.

### Elevation filter

- Given an isochrone polygon and a minimum elevation threshold (metres), returns the subset of the
  isochrone where terrain is at or above that threshold.
- Elevation data comes from the Copernicus DEM GLO-30 dataset hosted on AWS Open Data.
  Tiles are downloaded on demand and cached locally under `data/elevation_cache/`.
- No manual download or API key is required.

### Horizon filter

- Given an isochrone polygon and a minimum sky-open fraction (0–100 %), returns the subset
  of the isochrone where the surrounding terrain blocks less than the complementary fraction
  of the sky hemisphere.
- Elevation data comes from the same Copernicus DEM GLO-30 tiles used by the elevation filter
  (auto-downloaded and cached; no API key required).
- No additional dataset or configuration is needed.

#### Algorithm

For every point on a regular ~100 m grid covering the isochrone bounding box:

1. **Ray-casting** – 16 rays are cast from the observer, evenly spaced at 22.5° azimuth
   intervals (0 = north, clockwise).  Along each ray, terrain elevation is sampled at 20
   logarithmically spaced distances from 500 m to 20 km.

2. **Horizon elevation angle** – the maximum positive elevation angle seen along each ray:

   ```
   h(α) = max  arctan( (elev_terrain − elev_observer) / d )
           d
   ```

   Terrain *below* the observer (negative angles) is ignored; it cannot block sky.

3. **Sky fraction** – derived from the solid-angle integral over the celestial hemisphere:

   ```
   F = 1 − mean( sin(h(αᵢ)) )
   ```

   Derivation: the sky strip visible above a horizon of elevation h in a given azimuth
   contributes solid angle ∝ ∫_{h}^{π/2} cos(el) d(el) = 1 − sin(h).  Averaging over
   all azimuths and normalising to the hemisphere gives F = 1 − mean(sin(hᵢ)).

   | Site type | Average horizon | Sky fraction |
   |-----------|----------------|-------------|
   | Flat field | 0° | 1.00 |
   | Gentle hills (5°) | 5° | 0.91 |
   | Open valley (10°) | 10° | 0.83 |
   | Hemmed valley (20°) | 20° | 0.66 |
   | Deep valley (30°) | 30° | 0.50 |

   > **Note on the DSM**: the Copernicus GLO-30 is a Digital *Surface* Model that includes
   > tree canopies and buildings.  Ray-casting starts at 500 m to avoid these local artefacts:
   > at 500 m a 20 m tree contributes only arctan(20/500) ≈ 2.3° to the horizon, which is
   > negligible.  The relevant geographic horizon for astronomy is the terrain 1–20 km away.

4. **Filter polygon** – the sky-fraction raster is thresholded at the requested minimum,
   vectorised, and intersected with the isochrone polygon — identical pipeline to the
   elevation and light-pollution filters.

The per-azimuth horizon profile h(α) computed by this step is also the data structure
needed for future astronomical target visibility: a target at azimuth α and altitude β is
visible if and only if β > h(α).

### Cloud sky-fraction filter

- Given an isochrone polygon and a minimum clear-sky fraction (0–100 %), returns
  the subset of the isochrone where the fraction of the sky hemisphere free of
  clouds meets or exceeds that threshold.
- Cloud data comes from the Open-Meteo API (no authentication or download required).
  Open-Meteo provides real-time cloud cover for three atmospheric layers.
- The result includes a timestamp ("data as of …") because cloud cover is
  ephemeral and changes on the timescale of one to several hours.

#### Algorithm

1. **Cloud sampling**: cloud cover (low / mid / high layer) is fetched at a
   ~10 km grid covering the isochrone bounding box + 50 km buffer.  Requests
   are batched in groups of 50 locations and sent in parallel.

   | Layer | Open-Meteo field | Representative altitude |
   |-------|-----------------|------------------------|
   | Low | `cloud_cover_low` | 1 500 m |
   | Mid | `cloud_cover_mid` | 5 000 m |
   | High | `cloud_cover_high` | 10 000 m |

2. **Directional ray sampling**: from each observer point on a ~1 km grid,
   16 azimuths × 8 elevation angles are sampled.  Elevation angles are equally
   spaced in sin(θ) above 10° (the same cutoff as the terrain horizon filter),
   so each ray represents an equal solid angle of the accessible sky hemisphere.

3. **Layer intersections**: for each direction (az, θ) and cloud layer at
   altitude H, the ray hits the layer at horizontal distance r = H / tan(θ).
   Cloud cover at that ground position is read by bilinear interpolation from
   the cloud grid.

4. **Clear fraction per direction**: the three layers are modelled as
   statistically independent.  The probability that a ray in this direction
   reaches clear sky is:

   ```
   clear(az, θ) = (1 − C_low) × (1 − C_mid) × (1 − C_high)
   ```

5. **Sky fraction per observer**:

   ```
   F = mean over all (az, θ) directions of clear(az, θ)
   ```

   Because directions are sampled with equal solid-angle spacing, this is a
   direct estimate of the fraction of the usable sky hemisphere that is
   cloud-free.

6. **Filter polygon**: the sky-fraction raster is thresholded at the requested
   minimum, vectorised, and intersected with the isochrone polygon — identical
   pipeline to all other filters.

> **Precision note**: Open-Meteo's underlying NWP model resolution is ~7 km in
> Europe (ICON-EU) and ~25 km globally (ERA5/GFS).  Output polygon boundaries
> have ~7 km spatial accuracy.  The UI labels the layer as approximate.

### Light pollution overlay

- A raster tile overlay sourced from NASA GIBS (Black Marble 2016 VIIRS composite).
- Tiles are proxied through the backend on demand; no local dataset is required.
- The overlay can be toggled independently of the filter.
- Maximum zoom level for this layer is 8 (matching the GIBS dataset resolution).

### Light pollution filter

- Given an isochrone polygon and a maximum Bortle class (1–9), returns the subset of the isochrone
  where measured radiance falls at or below the threshold corresponding to that Bortle class.
- Requires a local GeoTIFF dataset at `data/light_pollution/light_pollution.tif`.
- The UI provides a download button that attempts an automatic download. See the dataset setup
  section below for details.

---

## Light pollution dataset setup

The light pollution filter requires a single-band radiance GeoTIFF covering the area of interest.

### Automatic download via the UI

The UI includes a **Download dataset** button. When clicked, the backend attempts to download the
VIIRS Annual VNL composite for 2022 from the Earth Observation Group (EOG) data server:

```
https://eogdata.mines.edu/nighttime_light/annual/v22/2022/
VNL_v22_npp-j01_2022_global_vcmslcfg_c202302011300.median_masked.dat.tif.gz
```

This download requires authentication on the EOG server side and will likely fail with an HTTP
error. If it does, the status endpoint will report `"error": "manual_download_required"`.

### Manual download

1. Create a free account at [eogdata.mines.edu](https://eogdata.mines.edu).
2. Navigate to **Nighttime Light > Annual VNL V2.2** and download the global median-masked
   composite for the year of your choice (`.tif.gz` file, approximately 3 GB compressed).
3. Decompress the archive:

   ```bash
   gunzip VNL_v22_npp-j01_2022_global_vcmslcfg_c202302011300.median_masked.dat.tif.gz
   ```

4. Place the resulting `.tif` file at:

   ```
   data/light_pollution/light_pollution.tif
   ```

   Create the directory if it does not exist:

   ```bash
   mkdir -p data/light_pollution
   ```

The overlay (NASA GIBS tiles) works independently and does not require this file.

### Bortle scale mapping

The filter maps Bortle classes to approximate sky brightness thresholds (radiance in nW/cm²/sr):

| Bortle | Threshold |
|--------|-----------|
| 1      | 0.01      |
| 2      | 0.03      |
| 3      | 0.10      |
| 4      | 0.30      |
| 5      | 1.00      |
| 6      | 3.00      |
| 7      | 10.00     |
| 8      | 30.00     |
| 9      | (any)     |

---

## API endpoints

All endpoints are prefixed with `/api`.

### Geocoding

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/geocode?q=<address>` | Search for an address using Nominatim |

### Pins

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pins` | List all saved pins |
| POST | `/api/pins` | Save a new pin |
| DELETE | `/api/pins/{id}` | Delete a pin |

### Isochrones

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/isochrones` | Compute an isochrone polygon |

### Elevation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/elevation` | Filter an isochrone by minimum elevation |

### Horizon

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/horizon` | Filter an isochrone by minimum sky-open fraction |

### Cloud cover

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cloud-cover/filter` | Filter an isochrone by minimum clear-sky fraction |
| GET | `/api/cloud-cover/overlay/{z}/{x}/{y}.png` | Proxy cloud-cover raster tile |

### Light pollution

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/light-pollution/status` | Dataset availability and download state |
| POST | `/api/light-pollution/download` | Start background dataset download |
| POST | `/api/light-pollution/filter` | Filter an isochrone by maximum Bortle class |
| GET | `/api/light-pollution/overlay/{z}/{x}/{y}.png` | Proxy NASA GIBS Black Marble tile |

---

## Project structure

```
AstroSpotFinder/
├── data/
│   ├── elevation_cache/        # Copernicus DEM tiles (auto-downloaded)
│   ├── light_pollution/        # light_pollution.tif + metadata.json
│   └── pins.geojson
│
├── src/
│   ├── main.py
│   │
│   ├── app/
│   │   ├── server.py
│   │   ├── paths.py
│   │   │
│   │   ├── api/
│   │   │   ├── elevation.py
│   │   │   ├── geocoding.py
│   │   │   ├── isochrones.py
│   │   │   ├── light_pollution.py
│   │   │   └── pins.py
│   │   │
│   │   ├── models/
│   │   │   ├── bounding_box.py
│   │   │   ├── elevation.py
│   │   │   ├── geocoding_result.py
│   │   │   ├── isochrone.py
│   │   │   ├── light_pollution.py
│   │   │   ├── location.py
│   │   │   └── pin.py
│   │   │
│   │   ├── repositories/
│   │   │   └── pin_repository.py
│   │   │
│   │   └── static/
│   │       ├── index.html
│   │       ├── css/
│   │       └── js/
│   │
│   ├── elevation/
│   │   ├── copernicus.py       # Tile download from AWS Open Data
│   │   └── service.py          # Rasterio filter logic
│   │
│   ├── cloud_cover/
│   │   ├── filter_service.py   # Open-Meteo fetch + cloud sky-fraction computation
│   │   └── service.py          # Cloud-cover tile rendering
│   │
│   ├── horizon/
│   │   └── service.py          # Ray-casting sky-fraction computation
│   │
│   ├── geocoding/
│   │   ├── nominatim.py
│   │   └── service.py
│   │
│   ├── light_pollution/
│   │   ├── dataset.py          # Download state + metadata
│   │   └── service.py          # Rasterio filter logic
│   │
│   └── routing/
│       ├── valhalla.py
│       └── service.py
│
├── pyproject.toml
└── README.md
```

---

## Architecture overview

AstroSpotFinder separates the application into four main areas:

```
Python server
    Serves the application and exposes backend APIs

Frontend application
    Connects interface components and user interactions

Map rendering
    Displays geographic objects using MapLibre

Domain models and services
    Represent and process geographic and astronomical data
```

A major design goal is to keep visual rendering separate from geographic calculations:

```
Python calculation
    produces geographic data
            |
           JSON
            |
JavaScript frontend
    creates visual objects
            |
MapView displays them
```

The backend returns data. The frontend handles rendering.

### Backend feature pattern

Each backend feature follows the same layered structure:

```
API route  (src/app/api/)
    validates request, calls service, converts errors to HTTP responses

Service  (src/<domain>/service.py)
    implements feature logic, raises domain-specific exceptions

Provider or adapter  (src/<domain>/<provider>.py)
    communicates with external data sources or tools

Model  (src/app/models/)
    defines validated Pydantic input/output types
```

---

## Design principles

- Build incrementally: each step should keep the application runnable.
- Keep responsibilities narrow: one clear reason to change per module.
- Keep calculations out of the frontend.
- Keep rendering out of the backend.
- Avoid generic utility containers (`tools/`, `helpers/`, `misc/`).
- Prefer stable data contracts between frontend and backend.

---

## Data sources and attributions

| Source | Usage | License |
|--------|-------|---------|
| OpenStreetMap contributors | Base map tiles | ODbL |
| Nominatim / OpenStreetMap | Address geocoding | ODbL |
| Valhalla (local) | Isochrone routing | MIT |
| Copernicus DEM GLO-30 (AWS) | Elevation filter, horizon filter | CC-BY 4.0 |
| Open-Meteo | Cloud sky-fraction filter | CC-BY 4.0 |
| NASA Black Marble / GIBS | Light pollution overlay | Public Domain (U.S. Government) |
| VIIRS Annual VNL V2.2 (EOG) | Light pollution filter | See EOG terms |

The VIIRS Annual VNL dataset is produced by the Earth Observation Group (EOG) at the Colorado
School of Mines. Citation: Falchi et al., registration and download at
[eogdata.mines.edu](https://eogdata.mines.edu).

---

## Filters and scores

Some criteria should completely remove a candidate location:

```
travel time exceeds maximum
altitude is below minimum
location is inside a restricted area
terrain is too steep
```

Other criteria should influence ranking rather than remove a candidate:

```
light-pollution level
cloud coverage
walking distance
horizon quality
Moon interference
```

The search system therefore distinguishes between:

```
Filters
    Decide whether a candidate is valid

Scores
    Decide how good a valid candidate is
```

---

## Planned features

- Weather forecast integration (wind, humidity, seeing index).
- Moon position, phase, and interference window.
- Astronomical target visibility (rise/set times, maximum altitude).
- Candidate spot scoring and ranking.
- Multi-stop trip planning with isochrone intersections.

---

## License

The software license has not yet been selected. Because AstroSpotFinder is intended to be open
source and may later be offered as a hosted service, possible licenses include AGPL-3.0, GPL-3.0,
Apache-2.0, or MIT.

Data sources have separate licenses and attribution requirements as listed above.
