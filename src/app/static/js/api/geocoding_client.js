import { BoundingBox } from "../models/bounding_box.js";
import { GeocodingResult } from "../models/geocoding_result.js";
import { Location } from "../models/location.js";


export class GeocodingClient {
    constructor({
        baseUrl = "/api/geocode"
    } = {}) {
        this.baseUrl = baseUrl;
    }

    async search(query) {
        const url = `${this.baseUrl}?${new URLSearchParams({ q: query })}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Geocoding service is unavailable.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new TypeError(
                "The geocoding API returned an invalid response."
            );
        }

        return data.map((item) => new GeocodingResult({
            location: new Location({
                latitude: item.location.latitude,
                longitude: item.location.longitude,
            }),
            label: item.label,
            boundingBox: this.deserializeBoundingBox(
                item.bounding_box
            ),
        }));
    }

    deserializeBoundingBox(data) {
        if (data === null || data === undefined) {
            return null;
        }

        try {
            return new BoundingBox({
                north: data.north,
                south: data.south,
                east: data.east,
                west: data.west,
            });
        } catch {
            return null;
        }
    }
}
