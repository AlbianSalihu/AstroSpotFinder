import { BoundingBox } from "./bounding_box.js";
import { Location } from "./location.js";


export class GeocodingResult {
    constructor({ location, label, boundingBox = null }) {
        if (!(location instanceof Location)) {
            throw new TypeError(
                "GeocodingResult location must be a Location instance."
            );
        }

        if (typeof label !== "string" || label.trim() === "") {
            throw new TypeError(
                "GeocodingResult label must be a non-empty string."
            );
        }

        if (boundingBox !== null && !(boundingBox instanceof BoundingBox)) {
            throw new TypeError(
                "GeocodingResult boundingBox must be a BoundingBox or null."
            );
        }

        this.location = location;
        this.label = label;
        this.boundingBox = boundingBox;

        Object.freeze(this);
    }
}
