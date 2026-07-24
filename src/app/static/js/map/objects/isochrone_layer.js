import { MapObject } from "../map_object.js";


const COLORS = {
    driving: "#f97316",
    walking: "#0d9488",
};


export class IsochroneLayer extends MapObject {
    constructor({ id, result }) {
        super(id);

        this.result = result;
        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        const { mode, geometry } = this.result;
        const color = COLORS[mode] ?? "#4a90d9";
        const fillId = `${this.id}-fill`;
        const outlineId = `${this.id}-outline`;

        mapView.map.addSource(this.id, {
            type: "geojson",
            data: {
                type: "Feature",
                geometry,
            },
        });

        mapView.map.addLayer({
            id: fillId,
            type: "fill",
            source: this.id,
            paint: {
                "fill-color": color,
                "fill-opacity": 0.1,
            },
        });

        mapView.map.addLayer({
            id: outlineId,
            type: "line",
            source: this.id,
            paint: {
                "line-color": color,
                "line-width": 2,
                "line-opacity": 0.8,
                "line-dasharray": [3, 2],
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
