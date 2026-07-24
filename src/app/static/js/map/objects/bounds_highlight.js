import { MapObject } from "../map_object.js";


export class BoundsHighlight extends MapObject {
    constructor({
        id,
        boundingBox,
        visibleMs = 2000,
        fadeMs = 800,
    }) {
        super(id);

        this.boundingBox = boundingBox;
        this.visibleMs = visibleMs;
        this.fadeMs = fadeMs;

        this.mapView = null;
        this.moveEndHandler = null;
        this.fadeTimer = null;
        this.removeTimer = null;
    }

    attach(mapView) {
        this.mapView = mapView;

        const sourceId = this.id;
        const fillId = `${this.id}-fill`;
        const outlineId = `${this.id}-outline`;

        mapView.map.addSource(sourceId, {
            type: "geojson",
            data: {
                type: "Feature",
                geometry: this.boundingBox.toGeoJsonPolygon(),
            },
        });

        mapView.map.addLayer({
            id: fillId,
            type: "fill",
            source: sourceId,
            paint: {
                "fill-color": "#4a90d9",
                "fill-opacity": 0.2,
                "fill-opacity-transition": {
                    duration: this.fadeMs,
                },
            },
        });

        mapView.map.addLayer({
            id: outlineId,
            type: "line",
            source: sourceId,
            paint: {
                "line-color": "#4a90d9",
                "line-width": 2,
                "line-opacity": 0.7,
                "line-opacity-transition": {
                    duration: this.fadeMs,
                },
            },
        });

        // Wait for the camera animation to finish before starting the timer,
        // otherwise the highlight fades out while the map is still mid-flight.
        if (mapView.map.isMoving()) {
            this.moveEndHandler = () => {
                this.moveEndHandler = null;
                this.startFadeTimer();
            };

            mapView.map.once("moveend", this.moveEndHandler);
        } else {
            this.startFadeTimer();
        }
    }

    startFadeTimer() {
        const fillId = `${this.id}-fill`;
        const outlineId = `${this.id}-outline`;

        this.fadeTimer = setTimeout(() => {
            const map = this.mapView?.map;

            if (map) {
                if (map.getLayer(fillId)) {
                    map.setPaintProperty(
                        fillId,
                        "fill-opacity",
                        0
                    );
                }

                if (map.getLayer(outlineId)) {
                    map.setPaintProperty(
                        outlineId,
                        "line-opacity",
                        0
                    );
                }
            }

            this.removeTimer = setTimeout(() => {
                this.mapView?.removeObject(this.id);
            }, this.fadeMs);
        }, this.visibleMs);
    }

    detach() {
        if (this.moveEndHandler) {
            this.mapView?.map.off("moveend", this.moveEndHandler);
            this.moveEndHandler = null;
        }

        clearTimeout(this.fadeTimer);
        clearTimeout(this.removeTimer);

        const map = this.mapView?.map;

        if (map) {
            const fillId = `${this.id}-fill`;
            const outlineId = `${this.id}-outline`;

            if (map.getLayer(outlineId)) {
                map.removeLayer(outlineId);
            }

            if (map.getLayer(fillId)) {
                map.removeLayer(fillId);
            }

            if (map.getSource(this.id)) {
                map.removeSource(this.id);
            }
        }

        this.mapView = null;
    }
}
