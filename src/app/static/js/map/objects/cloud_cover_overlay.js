import { MapObject } from "../map_object.js";


export class CloudCoverOverlay extends MapObject {
    constructor({ id }) {
        super(id);
        this.mapView = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        mapView.map.addSource(this.id, {
            type: "raster",
            tiles: ["/api/cloud-cover/overlay/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 5,
        });

        mapView.map.addLayer({
            id: `${this.id}-layer`,
            type: "raster",
            source: this.id,
            paint: { "raster-opacity": 1.0 },
        });
    }

    detach() {
        const map = this.mapView?.map;

        if (map) {
            const layerId = `${this.id}-layer`;
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(this.id)) map.removeSource(this.id);
        }

        this.mapView = null;
    }
}
