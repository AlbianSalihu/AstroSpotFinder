import { Location } from "./location.js";


export class Pin {
    constructor({
        id,
        location,
        source = "unknown",
        label = null
    }) {
        if (typeof id !== "string" || id.trim() === "") {
            throw new TypeError(
                "Pin ID must be a non-empty string."
            );
        }

        if (!(location instanceof Location)) {
            throw new TypeError(
                "Pin location must be a Location instance."
            );
        }

        this.id = id;
        this.location = location;
        this.source = source;
        this.label = label;

        Object.freeze(this);
    }
}