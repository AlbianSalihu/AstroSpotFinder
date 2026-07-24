export class BoundingBox {
    constructor({ north, south, east, west }) {
        if (
            !Number.isFinite(north)
            || !Number.isFinite(south)
            || !Number.isFinite(east)
            || !Number.isFinite(west)
        ) {
            throw new TypeError(
                "BoundingBox coordinates must be finite numbers."
            );
        }

        this.north = north;
        this.south = south;
        this.east = east;
        this.west = west;

        Object.freeze(this);
    }

    toMapBounds() {
        return [
            [this.west, this.south],
            [this.east, this.north],
        ];
    }

    toGeoJsonPolygon() {
        const { north, south, east, west } = this;

        return {
            type: "Polygon",
            coordinates: [[
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]],
        };
    }
}
