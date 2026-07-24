import { MapObject } from "../map_object.js";

const FILL_COLOR = "#78350f";    // amber-900 — earthy, distinct from green reachable
const OUTLINE_COLOR = "#92400e";

export class TerrainFilterLayer extends MapObject {
    constructor({ id, geometry }) {
        super(id);
        this.geometry = geometry;
        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        mapView.map.addSource(this.id, {
            type: "geojson",
            data: { type: "Feature", geometry: this.geometry },
        });

        mapView.map.addLayer({
            id: `${this.id}-fill`,
            type: "fill",
            source: this.id,
            paint: { "fill-color": FILL_COLOR, "fill-opacity": 0.28 },
        });

        mapView.map.addLayer({
            id: `${this.id}-outline`,
            type: "line",
            source: this.id,
            paint: { "line-color": OUTLINE_COLOR, "line-width": 1.5 },
        });
    }

    detach() {
        const map = this.mapView?.map;
        if (map) {
            if (map.getLayer(`${this.id}-fill`)) map.removeLayer(`${this.id}-fill`);
            if (map.getLayer(`${this.id}-outline`)) map.removeLayer(`${this.id}-outline`);
            if (map.getSource(this.id)) map.removeSource(this.id);
        }
        this.mapView = null;
    }
}
