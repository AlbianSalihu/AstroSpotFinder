import { MapObject } from "../map_object.js";


export class ParkingsLayer extends MapObject {
    constructor({ id, result, onParkingRemoved = null }) {
        super(id);

        this.result = result;
        this.mapView = null;
        this._popup = null;
        this._clickHandler = null;
        this._enterHandler = null;
        this._leaveHandler = null;
        this._onParkingRemoved = onParkingRemoved;
    }

    attach(mapView) {
        this.mapView = mapView;

        const circlesId = `${this.id}-circles`;
        const labelsId = `${this.id}-labels`;

        const geojson = {
            type: "FeatureCollection",
            features: this.result.parkings.map((p) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [p.lon, p.lat] },
                properties: {
                    osm_id: p.osm_id,
                    name: p.name ?? null,
                    access: p.access ?? null,
                    fee: p.fee ?? null,
                    lat: p.lat,
                    lon: p.lon,
                },
            })),
        };

        mapView.map.addSource(this.id, { type: "geojson", data: geojson });

        mapView.map.addLayer({
            id: circlesId,
            type: "circle",
            source: this.id,
            paint: {
                "circle-radius": 9,
                "circle-color": "#1e293b",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
            },
        });

        mapView.map.addLayer({
            id: labelsId,
            type: "symbol",
            source: this.id,
            layout: {
                "text-field": "P",
                "text-size": 11,
                "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
                "text-anchor": "center",
            },
            paint: {
                "text-color": "#ffffff",
            },
        });

        this._clickHandler = (e) => {
            if (!e.features.length) return;
            const props = e.features[0].properties;
            const { lat, lon, osm_id } = props;
            const name = props.name || "Public parking";
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;

            let details = "";
            if (props.access && props.access !== "yes") {
                details += `<div class="parking-popup__row">Access: ${props.access}</div>`;
            }
            if (props.fee) {
                details += `<div class="parking-popup__row">Fee: ${props.fee === "yes" ? "paid" : "free"}</div>`;
            }

            if (this._popup) {
                this._popup.remove();
            }

            this._popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
                .setLngLat([lon, lat])
                .setHTML(
                    `<div class="parking-popup">
                        <strong class="parking-popup__name">${name}</strong>
                        ${details}
                        <a class="parking-popup__link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">↗ Google Maps</a>
                        <button class="parking-popup__remove" data-osm-id="${osm_id}">✕ Remove this parking</button>
                    </div>`
                )
                .addTo(mapView.map);

            if (this._onParkingRemoved) {
                const removeBtn = this._popup.getElement()?.querySelector(".parking-popup__remove");
                if (removeBtn) {
                    removeBtn.addEventListener("click", () => {
                        this._onParkingRemoved(osm_id);
                        this._popup?.remove();
                        this._popup = null;
                    });
                }
            }
        };

        this._enterHandler = () => { mapView.map.getCanvas().style.cursor = "pointer"; };
        this._leaveHandler = () => { mapView.map.getCanvas().style.cursor = ""; };

        mapView.map.on("click", circlesId, this._clickHandler);
        mapView.map.on("mouseenter", circlesId, this._enterHandler);
        mapView.map.on("mouseleave", circlesId, this._leaveHandler);
    }

    detach() {
        const map = this.mapView?.map;

        if (map) {
            const circlesId = `${this.id}-circles`;
            const labelsId = `${this.id}-labels`;

            if (this._clickHandler) map.off("click", circlesId, this._clickHandler);
            if (this._enterHandler) map.off("mouseenter", circlesId, this._enterHandler);
            if (this._leaveHandler) map.off("mouseleave", circlesId, this._leaveHandler);

            if (this._popup) {
                this._popup.remove();
                this._popup = null;
            }

            if (map.getLayer(labelsId)) map.removeLayer(labelsId);
            if (map.getLayer(circlesId)) map.removeLayer(circlesId);
            if (map.getSource(this.id)) map.removeSource(this.id);

            map.getCanvas().style.cursor = "";
        }

        this.mapView = null;
    }
}
