export class Location {
    constructor({
        latitude,
        longitude
    }) {
        if (!Number.isFinite(latitude)) {
            throw new TypeError("Latitude must be a finite number.");
        }

        if (!Number.isFinite(longitude)) {
            throw new TypeError("Longitude must be a finite number.");
        }

        if (latitude < -90 || latitude > 90) {
            throw new RangeError(
                "Latitude must be between -90 and 90."
            );
        }

        if (longitude < -180 || longitude > 180) {
            throw new RangeError(
                "Longitude must be between -180 and 180."
            );
        }

        this.latitude = latitude;
        this.longitude = longitude;

        Object.freeze(this);
    }

    toMapCoordinates() {
        return [
            this.longitude,
            this.latitude
        ];
    }
}