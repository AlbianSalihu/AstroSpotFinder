import { Location } from "../models/location.js";


export class MapView {
    constructor({
        container,
        style,
        center,
        zoom
    }) {
        this.map = new window.maplibregl.Map({
            container,
            style,
            center,
            zoom
        });

        this.objects = new Map();

        this.addDefaultControls();
    }

    addDefaultControls() {
        this.map.addControl(
            new window.maplibregl.NavigationControl(),
            "top-right"
        );
    }

    addObject(mapObject) {
        if (this.objects.has(mapObject.id)) {
            throw new Error(
                `Map object "${mapObject.id}" already exists.`
            );
        }

        mapObject.attach(this);
        this.objects.set(mapObject.id, mapObject);
    }

    removeObject(objectId) {
        const mapObject = this.objects.get(objectId);

        if (!mapObject) {
            return false;
        }

        mapObject.detach();
        this.objects.delete(objectId);

        return true;
    }

    hasObject(objectId) {
        return this.objects.has(objectId);
    }
    
    getObject(objectId) {
        return this.objects.get(objectId) ?? null;
    }

    clearObjects() {
        for (const mapObject of this.objects.values()) {
            mapObject.detach();
        }

        this.objects.clear();
    }

    createMarker({
        element,
        location,
        anchor = "bottom"
    }) {
        return new window.maplibregl.Marker({
            element,
            anchor
        })
            .setLngLat(location.toMapCoordinates())
            .addTo(this.map);
    }

    onClick(callback) {
        const handler = (event) => {
            const location = new Location({
                latitude: event.lngLat.lat,
                longitude: event.lngLat.lng
            });

            callback(location);
        };

        this.map.on("click", handler);

        return () => {
            this.map.off("click", handler);
        };
    }

    flyTo(location, zoom = 13) {
        this.map.flyTo({
            center: location.toMapCoordinates(),
            zoom,
        });
    }

    fitBounds(boundingBox) {
        this.map.fitBounds(
            boundingBox.toMapBounds(),
            { padding: 40, maxZoom: 16 }
        );
    }

    setCursor(cursor) {
        this.map.getCanvas().style.cursor = cursor;
    }

    destroy() {
        this.clearObjects();
        this.map.remove();
    }
}