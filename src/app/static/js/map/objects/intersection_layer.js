import { MapObject } from "../map_object.js";


const FILL_COLOR = "#e11d48";
const OUTLINE_COLOR = "#be123c";


export class IntersectionLayer extends MapObject {
    constructor({ id, result }) {
        super(id);

        this.result = result;
        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        const fillId = `${this.id}-fill`;
        const outlineId = `${this.id}-outline`;

        mapView.map.addSource(this.id, {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: this.result.geometry,
            },
        });

        mapView.map.addLayer({
            id: fillId,
            type: "fill",
            source: this.id,
            paint: {
                "fill-color": FILL_COLOR,
                "fill-opacity": 0.2,
            },
        });

        mapView.map.addLayer({
            id: outlineId,
            type: "line",
            source: this.id,
            paint: {
                "line-color": OUTLINE_COLOR,
                "line-width": 2.5,
                "line-opacity": 1.0,
            },
        });
    }

    detach() {
        const map = this.mapView?.map;

        if (map) {
            const fillId = `${this.id}-fill`;
            const outlineId = `${this.id}-outline`;

            if (map.getLayer(outlineId)) map.removeLayer(outlineId);
            if (map.getLayer(fillId)) map.removeLayer(fillId);
            if (map.getSource(this.id)) map.removeSource(this.id);
        }

        this.mapView = null;
    }
}
