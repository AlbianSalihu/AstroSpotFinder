export class MapObject {
    constructor(id) {
        if (typeof id !== "string" || id.trim() === "") {
            throw new TypeError(
                "Map object ID must be a non-empty string."
            );
        }

        this.id = id;
    }

    attach(_mapView) {
        throw new Error(
            "attach(mapView) must be implemented."
        );
    }

    detach() {
        throw new Error(
            "detach() must be implemented."
        );
    }
}