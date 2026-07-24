import { Pin } from "../models/pin.js";


export class PinDetails {
    constructor({
        mountPoint = document.body
    } = {}) {
        this.pin = null;
        this.deleteListeners = new Set();
        this.labelChangedListeners = new Set();
        this.isochroneRequestedListeners = new Set();
        this.isochroneRemovedListeners = new Set();
        this.elevationFilterRequestedListeners = new Set();
        this.elevationFilterRemovedListeners = new Set();
        this.horizonFilterRequestedListeners = new Set();
        this.horizonFilterRemovedListeners = new Set();
        this.cloudFilterRequestedListeners = new Set();
        this.cloudFilterRemovedListeners = new Set();
        this.intersectRequestedListeners = new Set();
        this.intersectRemovedListeners = new Set();
        this.parkingsRequestedListeners = new Set();
        this.parkingsRemovedListeners = new Set();
        this.lightPollutionFilterRequestedListeners = new Set();
        this.lightPollutionFilterRemovedListeners = new Set();
        this.walkingReachableRequestedListeners = new Set();
        this.walkingReachableRemovedListeners = new Set();
        this.rerunElevationOnWalkingListeners = new Set();
        this.rerunHorizonOnWalkingListeners = new Set();
        this.rerunCloudOnWalkingListeners = new Set();
        this.rerunLightPollutionOnWalkingListeners = new Set();
        this.terrainFilterRequestedListeners = new Set();
        this.terrainFilterRemovedListeners = new Set();
        this.localHorizonFilterRequestedListeners = new Set();
        this.localHorizonFilterRemovedListeners = new Set();

        this.selectedMode = "driving";
        this.isochroneActive = false;
        this.elevationFilterActive = false;
        this.horizonFilterActive = false;
        this.cloudFilterActive = false;
        this.lightPollutionFilterActive = false;
        this.intersectActive = false;
        this.parkingsActive = false;
        this.walkingReachableActive = false;
        this.terrainFilterActive = false;
        this.localHorizonFilterActive = false;
        this.lightPollutionDatasetAvailable = false;

        this.element = this.createElement();
        mountPoint.appendChild(this.element);

        this.hide();
    }

    createElement() {
        const panel = document.createElement("section");

        panel.className = "pin-details";
        panel.setAttribute("aria-live", "polite");

        const title = document.createElement("h2");

        title.className = "pin-details__title";
        title.textContent = "Selected pin";

        this.labelInput = document.createElement("input");
        this.labelInput.type = "text";
        this.labelInput.className = "pin-details__label";
        this.labelInput.placeholder = "No label";
        this.labelInput.setAttribute("aria-label", "Pin label");

        this.labelInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.labelInput.blur();
            }

            if (event.key === "Escape") {
                this.labelInput.value = this.pin?.label ?? "";
                this.labelInput.blur();
            }
        });

        this.labelInput.addEventListener("change", () => {
            if (this.pin === null) {
                return;
            }

            const newLabel = this.labelInput.value.trim() || null;

            if (newLabel !== (this.pin.label ?? null)) {
                this.emitLabelChanged(this.pin, newLabel);
            }
        });

        this.latitudeValue = document.createElement("span");
        this.longitudeValue = document.createElement("span");
        this.sourceValue = document.createElement("span");

        const information = document.createElement("dl");

        information.className = "pin-details__information";

        this.googleMapsLink = document.createElement("a");
        this.googleMapsLink.className = "pin-details__gmaps-link";
        this.googleMapsLink.target = "_blank";
        this.googleMapsLink.rel = "noopener noreferrer";
        this.googleMapsLink.textContent = "↗ Open in Google Maps";

        information.append(
            this.createInformationRow("Latitude", this.latitudeValue),
            this.createInformationRow("Longitude", this.longitudeValue),
            this.createInformationRow("Source", this.sourceValue),
            this.googleMapsLink
        );

        const isochroneSection = this.createIsochroneSection();
        const elevationSection = this.createElevationSection();
        const horizonSection = this.createHorizonSection();
        const cloudSection = this.createCloudFilterSection();
        const lightPollutionSection = this.createLightPollutionSection();
        const intersectSection = this.createIntersectSection();
        const parkingsSection = this.createParkingsSection();

        this.deleteButton = document.createElement("button");

        this.deleteButton.type = "button";
        this.deleteButton.className = "pin-details__delete";
        this.deleteButton.textContent = "Delete pin";

        this.deleteButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            this.emitDeleteRequested(this.pin);
        });

        panel.append(
            title,
            this.labelInput,
            information,
            isochroneSection,
            elevationSection,
            horizonSection,
            cloudSection,
            lightPollutionSection,
            intersectSection,
            parkingsSection,
            this.deleteButton
        );

        return panel;
    }

    createIsochroneSection() {
        const section = document.createElement("div");

        section.className = "pin-details__isochrone";

        const sectionTitle = document.createElement("h3");

        sectionTitle.className = "pin-details__isochrone-title";
        sectionTitle.textContent = "Reachable area";

        const modeToggle = document.createElement("div");

        modeToggle.className = "pin-details__mode-toggle";

        this.drivingButton = document.createElement("button");
        this.drivingButton.type = "button";
        this.drivingButton.className = "pin-details__mode-btn pin-details__mode-btn--active";
        this.drivingButton.title = "Driving";
        this.drivingButton.setAttribute("aria-pressed", "true");
        this.drivingButton.textContent = "🚗";

        this.walkingButton = document.createElement("button");
        this.walkingButton.type = "button";
        this.walkingButton.className = "pin-details__mode-btn";
        this.walkingButton.title = "Walking";
        this.walkingButton.setAttribute("aria-pressed", "false");
        this.walkingButton.textContent = "🚶";

        this.drivingButton.addEventListener("click", () => {
            this.setMode("driving");
        });

        this.walkingButton.addEventListener("click", () => {
            this.setMode("walking");
        });

        modeToggle.append(this.drivingButton, this.walkingButton);

        const minutesRow = document.createElement("div");

        minutesRow.className = "pin-details__minutes-row";

        const minutesLabel = document.createElement("label");

        minutesLabel.className = "pin-details__minutes-label";
        minutesLabel.textContent = "Minutes";

        this.minutesInput = document.createElement("input");
        this.minutesInput.type = "number";
        this.minutesInput.className = "pin-details__minutes-input";
        this.minutesInput.min = "1";
        this.minutesInput.max = "120";
        this.minutesInput.value = "15";
        this.minutesInput.setAttribute("aria-label", "Travel time in minutes");

        minutesRow.append(minutesLabel, this.minutesInput);

        this.isochroneButton = document.createElement("button");
        this.isochroneButton.type = "button";
        this.isochroneButton.className = "pin-details__isochrone-btn";
        this.isochroneButton.textContent = "Show reachable area";

        this.isochroneButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.isochroneActive) {
                this.emitIsochroneRemoved(this.pin);
            } else {
                const minutes = parseInt(this.minutesInput.value, 10);

                this.emitIsochroneRequested(this.pin, {
                    mode: this.selectedMode,
                    minutes: isNaN(minutes) ? 15 : minutes,
                });
            }
        });

        section.append(sectionTitle, modeToggle, minutesRow, this.isochroneButton);

        return section;
    }

    createElevationSection() {
        const section = document.createElement("div");

        section.className = "pin-details__elevation";
        section.hidden = true;

        this.elevationSection = section;

        const sectionTitle = document.createElement("h3");

        sectionTitle.className = "pin-details__elevation-title";
        sectionTitle.textContent = "Elevation filter";

        const elevationRow = document.createElement("div");

        elevationRow.className = "pin-details__elevation-row";

        const elevationLabel = document.createElement("label");

        elevationLabel.className = "pin-details__elevation-label";
        elevationLabel.textContent = "Min altitude";

        const elevationUnit = document.createElement("span");

        elevationUnit.className = "pin-details__elevation-unit";
        elevationUnit.textContent = "m";

        this.elevationInput = document.createElement("input");
        this.elevationInput.type = "number";
        this.elevationInput.className = "pin-details__elevation-input";
        this.elevationInput.min = "0";
        this.elevationInput.max = "8849";
        this.elevationInput.value = "500";
        this.elevationInput.setAttribute("aria-label", "Minimum altitude in metres");

        const inputWrapper = document.createElement("div");

        inputWrapper.className = "pin-details__elevation-input-wrapper";
        inputWrapper.append(this.elevationInput, elevationUnit);

        elevationRow.append(elevationLabel, inputWrapper);

        this.elevationButton = document.createElement("button");
        this.elevationButton.type = "button";
        this.elevationButton.className = "pin-details__elevation-btn";
        this.elevationButton.textContent = "Apply elevation filter";

        this.elevationButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.elevationFilterActive) {
                this.emitElevationFilterRemoved(this.pin);
            } else {
                const minElevation = parseInt(this.elevationInput.value, 10);

                this.emitElevationFilterRequested(this.pin, {
                    minElevation: isNaN(minElevation) ? 500 : minElevation,
                });
            }
        });

        this.elevationRerunBtn = document.createElement("button");
        this.elevationRerunBtn.type = "button";
        this.elevationRerunBtn.className = "pin-details__rerun-btn";
        this.elevationRerunBtn.textContent = "↺ Recompute reachable areas";
        this.elevationRerunBtn.hidden = true;

        this.elevationRerunBtn.addEventListener("click", () => {
            if (!this.pin) return;
            const minElevation = parseInt(this.elevationInput.value, 10);
            this.emitRerunElevationOnWalking(this.pin, { minElevation: isNaN(minElevation) ? 500 : minElevation });
        });

        section.append(sectionTitle, elevationRow, this.elevationButton, this.elevationRerunBtn);

        return section;
    }

    createHorizonSection() {
        const section = document.createElement("div");

        section.className = "pin-details__horizon";
        section.hidden = true;

        this.horizonSection = section;

        const sectionTitle = document.createElement("h3");

        sectionTitle.className = "pin-details__horizon-title";
        sectionTitle.textContent = "Horizon filter";

        const skyRow = document.createElement("div");

        skyRow.className = "pin-details__horizon-row";

        const skyLabel = document.createElement("label");

        skyLabel.className = "pin-details__horizon-label";
        skyLabel.textContent = "Min sky open";

        const skyUnit = document.createElement("span");

        skyUnit.className = "pin-details__horizon-unit";
        skyUnit.textContent = "%";

        this.skyFractionInput = document.createElement("input");
        this.skyFractionInput.type = "number";
        this.skyFractionInput.className = "pin-details__horizon-input";
        this.skyFractionInput.min = "0";
        this.skyFractionInput.max = "100";
        this.skyFractionInput.value = "80";
        this.skyFractionInput.setAttribute(
            "aria-label",
            "Minimum fraction of sky visible (0–100 %)"
        );

        const inputWrapper = document.createElement("div");

        inputWrapper.className = "pin-details__horizon-input-wrapper";
        inputWrapper.append(this.skyFractionInput, skyUnit);

        skyRow.append(skyLabel, inputWrapper);

        const note = document.createElement("p");

        note.className = "pin-details__horizon-note";
        note.textContent =
            "Fraction of the sky hemisphere not blocked by surrounding terrain.";

        this.horizonButton = document.createElement("button");
        this.horizonButton.type = "button";
        this.horizonButton.className = "pin-details__horizon-btn";
        this.horizonButton.textContent = "Apply horizon filter";

        this.horizonButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.horizonFilterActive) {
                this.emitHorizonFilterRemoved(this.pin);
            } else {
                const pct = parseInt(this.skyFractionInput.value, 10);
                const minSkyFraction = (isNaN(pct) ? 80 : Math.min(100, Math.max(0, pct))) / 100;

                this.emitHorizonFilterRequested(this.pin, { minSkyFraction });
            }
        });

        this.horizonRerunBtn = document.createElement("button");
        this.horizonRerunBtn.type = "button";
        this.horizonRerunBtn.className = "pin-details__rerun-btn";
        this.horizonRerunBtn.textContent = "↺ Recompute reachable areas";
        this.horizonRerunBtn.hidden = true;

        this.horizonRerunBtn.addEventListener("click", () => {
            if (!this.pin) return;
            const pct = parseInt(this.skyFractionInput.value, 10);
            const minSkyFraction = (isNaN(pct) ? 80 : Math.min(100, Math.max(0, pct))) / 100;
            this.emitRerunHorizonOnWalking(this.pin, { minSkyFraction });
        });

        section.append(sectionTitle, skyRow, note, this.horizonButton, this.horizonRerunBtn);

        return section;
    }

    createCloudFilterSection() {
        const section = document.createElement("div");

        section.className = "pin-details__cloud";
        section.hidden = true;

        this.cloudSection = section;

        const sectionTitle = document.createElement("h3");

        sectionTitle.className = "pin-details__cloud-title";
        sectionTitle.textContent = "Cloud sky fraction";

        const skyRow = document.createElement("div");

        skyRow.className = "pin-details__cloud-row";

        const skyLabel = document.createElement("label");

        skyLabel.className = "pin-details__cloud-label";
        skyLabel.textContent = "Min sky open";

        const skyUnit = document.createElement("span");

        skyUnit.className = "pin-details__cloud-unit";
        skyUnit.textContent = "%";

        this.cloudSkyInput = document.createElement("input");
        this.cloudSkyInput.type = "number";
        this.cloudSkyInput.className = "pin-details__cloud-input";
        this.cloudSkyInput.min = "0";
        this.cloudSkyInput.max = "100";
        this.cloudSkyInput.value = "75";
        this.cloudSkyInput.setAttribute(
            "aria-label",
            "Minimum cloud-free sky fraction (0–100 %)"
        );

        const inputWrapper = document.createElement("div");

        inputWrapper.className = "pin-details__cloud-input-wrapper";
        inputWrapper.append(this.cloudSkyInput, skyUnit);

        skyRow.append(skyLabel, inputWrapper);

        const note = document.createElement("p");

        note.className = "pin-details__cloud-note";
        note.textContent =
            "Fraction of the sky hemisphere free of clouds. Approximate (~7 km cloud data resolution).";

        this.cloudFetchedAt = document.createElement("p");
        this.cloudFetchedAt.className = "pin-details__cloud-fetched-at";
        this.cloudFetchedAt.hidden = true;

        this.cloudButton = document.createElement("button");
        this.cloudButton.type = "button";
        this.cloudButton.className = "pin-details__cloud-btn";
        this.cloudButton.textContent = "Apply cloud filter";

        this.cloudButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.cloudFilterActive) {
                this.emitCloudFilterRemoved(this.pin);
            } else {
                const pct = parseInt(this.cloudSkyInput.value, 10);
                const minSkyFraction = (isNaN(pct) ? 75 : Math.min(100, Math.max(0, pct))) / 100;

                this.emitCloudFilterRequested(this.pin, { minSkyFraction });
            }
        });

        this.cloudRerunBtn = document.createElement("button");
        this.cloudRerunBtn.type = "button";
        this.cloudRerunBtn.className = "pin-details__rerun-btn";
        this.cloudRerunBtn.textContent = "↺ Recompute reachable areas";
        this.cloudRerunBtn.hidden = true;

        this.cloudRerunBtn.addEventListener("click", () => {
            if (!this.pin) return;
            const pct = parseInt(this.cloudSkyInput.value, 10);
            const minSkyFraction = (isNaN(pct) ? 75 : Math.min(100, Math.max(0, pct))) / 100;
            this.emitRerunCloudOnWalking(this.pin, { minSkyFraction });
        });

        section.append(sectionTitle, skyRow, note, this.cloudFetchedAt, this.cloudButton, this.cloudRerunBtn);

        return section;
    }

    createIntersectSection() {
        const section = document.createElement("div");

        section.className = "pin-details__intersect";
        section.hidden = true;

        this.intersectSection = section;

        const note = document.createElement("p");

        note.className = "pin-details__intersect-note";
        note.textContent = "Show only areas where all active filters overlap.";

        this.intersectButton = document.createElement("button");
        this.intersectButton.type = "button";
        this.intersectButton.className = "pin-details__intersect-btn";
        this.intersectButton.textContent = "Intersect filters";
        this.intersectButton.disabled = true;

        this.intersectButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.intersectActive) {
                this.emitIntersectRemoved(this.pin);
            } else {
                this.emitIntersectRequested(this.pin);
            }
        });

        section.append(note, this.intersectButton);

        return section;
    }

    createParkingsSection() {
        const section = document.createElement("div");

        section.className = "pin-details__parkings";
        section.hidden = true;

        this.parkingsSection = section;

        const note = document.createElement("p");

        note.className = "pin-details__parkings-note";
        note.textContent = "Find public parking spots within the intersection (OpenStreetMap data).";

        this.parkingsButton = document.createElement("button");
        this.parkingsButton.type = "button";
        this.parkingsButton.className = "pin-details__parkings-btn";
        this.parkingsButton.textContent = "Find parkings";

        this.parkingsButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.parkingsActive) {
                this.emitParkingsRemoved(this.pin);
            } else {
                this.emitParkingsRequested(this.pin);
            }
        });

        // Walking reachable subsection
        this.walkingSubsection = document.createElement("div");
        this.walkingSubsection.className = "pin-details__walking";
        this.walkingSubsection.hidden = true;

        const walkingTitle = document.createElement("h3");
        walkingTitle.className = "pin-details__walking-title";
        walkingTitle.textContent = "Reachable on foot";

        const walkingRow = document.createElement("div");
        walkingRow.className = "pin-details__walking-row";

        const walkingLabel = document.createElement("label");
        walkingLabel.className = "pin-details__walking-label";
        walkingLabel.textContent = "Walk time";

        const walkingUnit = document.createElement("span");
        walkingUnit.className = "pin-details__walking-unit";
        walkingUnit.textContent = "min";

        this.walkingMinutesInput = document.createElement("input");
        this.walkingMinutesInput.type = "number";
        this.walkingMinutesInput.className = "pin-details__walking-input";
        this.walkingMinutesInput.min = "1";
        this.walkingMinutesInput.max = "60";
        this.walkingMinutesInput.value = "10";
        this.walkingMinutesInput.setAttribute("aria-label", "Walking time in minutes");

        const walkingInputWrapper = document.createElement("div");
        walkingInputWrapper.className = "pin-details__walking-input-wrapper";
        walkingInputWrapper.append(this.walkingMinutesInput, walkingUnit);

        walkingRow.append(walkingLabel, walkingInputWrapper);

        this.walkingReachableBtn = document.createElement("button");
        this.walkingReachableBtn.type = "button";
        this.walkingReachableBtn.className = "pin-details__walking-btn";
        this.walkingReachableBtn.textContent = "Reachable from parkings";

        this.walkingReachableBtn.addEventListener("click", () => {
            if (!this.pin) return;
            if (this.walkingReachableActive) {
                this.emitWalkingReachableRemoved(this.pin);
            } else {
                const minutes = parseInt(this.walkingMinutesInput.value, 10);
                this.emitWalkingReachableRequested(this.pin, { minutes: isNaN(minutes) ? 10 : minutes });
            }
        });

        this.walkingSubsection.append(walkingTitle, walkingRow, this.walkingReachableBtn);

        // ── Layer 1: terrain filter (WorldCover) ──────────────────────────────
        this.terrainSubsection = document.createElement("div");
        this.terrainSubsection.className = "pin-details__terrain";
        this.terrainSubsection.hidden = true;

        const terrainTitle = document.createElement("h3");
        terrainTitle.className = "pin-details__terrain-title";
        terrainTitle.textContent = "Open terrain";

        const terrainNote = document.createElement("p");
        terrainNote.className = "pin-details__terrain-note";
        terrainNote.textContent = "Remove forests, buildings and shrubs (WorldCover 10 m).";

        const terrainRow = document.createElement("div");
        terrainRow.className = "pin-details__terrain-row";

        const terrainLabel = document.createElement("label");
        terrainLabel.className = "pin-details__terrain-label";
        terrainLabel.textContent = "Building buffer";

        const terrainUnit = document.createElement("span");
        terrainUnit.className = "pin-details__terrain-unit";
        terrainUnit.textContent = "m";

        this.terrainBufferInput = document.createElement("input");
        this.terrainBufferInput.type = "number";
        this.terrainBufferInput.className = "pin-details__terrain-input";
        this.terrainBufferInput.min = "0";
        this.terrainBufferInput.max = "2000";
        this.terrainBufferInput.value = "150";
        this.terrainBufferInput.setAttribute("aria-label", "Building exclusion buffer (metres)");

        const terrainInputWrapper = document.createElement("div");
        terrainInputWrapper.className = "pin-details__terrain-input-wrapper";
        terrainInputWrapper.append(this.terrainBufferInput, terrainUnit);

        terrainRow.append(terrainLabel, terrainInputWrapper);

        this.terrainBtn = document.createElement("button");
        this.terrainBtn.type = "button";
        this.terrainBtn.className = "pin-details__terrain-btn";
        this.terrainBtn.textContent = "Filter forests & buildings";

        this.terrainBtn.addEventListener("click", () => {
            if (!this.pin) return;
            if (this.terrainFilterActive) {
                this.emitTerrainFilterRemoved(this.pin);
            } else {
                const buf = parseInt(this.terrainBufferInput.value, 10);
                const buildupBufferM = isNaN(buf) ? 150 : Math.max(0, Math.min(2000, buf));
                this.emitTerrainFilterRequested(this.pin, { buildupBufferM });
            }
        });

        this.terrainSubsection.append(terrainTitle, terrainNote, terrainRow, this.terrainBtn);

        // ── Layer 2: local horizon (ray-casting 10–500 m) ────────────────────
        this.localHorizonSubsection = document.createElement("div");
        this.localHorizonSubsection.className = "pin-details__local-horizon";
        this.localHorizonSubsection.hidden = true;

        const localHorizonTitle = document.createElement("h3");
        localHorizonTitle.className = "pin-details__local-horizon-title";
        localHorizonTitle.textContent = "Local sky opening";

        const localHorizonNote = document.createElement("p");
        localHorizonNote.className = "pin-details__local-horizon-note";
        localHorizonNote.textContent = "Ray-cast from 10 m to 500 m — finds spots where nearby obstacles don't block the sky.";

        const localHorizonRow = document.createElement("div");
        localHorizonRow.className = "pin-details__local-horizon-row";

        const localHorizonLabel = document.createElement("label");
        localHorizonLabel.className = "pin-details__local-horizon-label";
        localHorizonLabel.textContent = "Min sky";

        const localHorizonUnit = document.createElement("span");
        localHorizonUnit.className = "pin-details__local-horizon-unit";
        localHorizonUnit.textContent = "%";

        this.localHorizonInput = document.createElement("input");
        this.localHorizonInput.type = "number";
        this.localHorizonInput.className = "pin-details__local-horizon-input";
        this.localHorizonInput.min = "0";
        this.localHorizonInput.max = "100";
        this.localHorizonInput.value = "70";
        this.localHorizonInput.setAttribute("aria-label", "Minimum visible sky fraction (%)");

        const localHorizonInputWrapper = document.createElement("div");
        localHorizonInputWrapper.className = "pin-details__local-horizon-input-wrapper";
        localHorizonInputWrapper.append(this.localHorizonInput, localHorizonUnit);

        localHorizonRow.append(localHorizonLabel, localHorizonInputWrapper);

        this.localHorizonBtn = document.createElement("button");
        this.localHorizonBtn.type = "button";
        this.localHorizonBtn.className = "pin-details__local-horizon-btn";
        this.localHorizonBtn.textContent = "Apply local horizon";

        this.localHorizonBtn.addEventListener("click", () => {
            if (!this.pin) return;
            if (this.localHorizonFilterActive) {
                this.emitLocalHorizonFilterRemoved(this.pin);
            } else {
                const pct = parseInt(this.localHorizonInput.value, 10);
                const minSkyFraction = isNaN(pct) ? 0.70 : Math.max(0, Math.min(100, pct)) / 100;
                this.emitLocalHorizonFilterRequested(this.pin, { minSkyFraction });
            }
        });

        this.localHorizonSubsection.append(
            localHorizonTitle, localHorizonNote, localHorizonRow, this.localHorizonBtn,
        );

        section.append(
            note,
            this.parkingsButton,
            this.walkingSubsection,
            this.terrainSubsection,
            this.localHorizonSubsection,
        );

        return section;
    }

    createLightPollutionSection() {
        const section = document.createElement("div");

        section.className = "pin-details__light-pollution";
        section.hidden = true;

        this.lightPollutionSection = section;

        const sectionTitle = document.createElement("h3");

        sectionTitle.className = "pin-details__lp-title";
        sectionTitle.textContent = "Light pollution filter";

        this.lpUnavailableNote = document.createElement("p");
        this.lpUnavailableNote.className = "pin-details__lp-unavailable";
        this.lpUnavailableNote.textContent =
            "Dataset not downloaded. Use the panel at the bottom-right to download it.";

        this.lpControls = document.createElement("div");
        this.lpControls.className = "pin-details__lp-controls";
        this.lpControls.hidden = true;

        const bortleRow = document.createElement("div");

        bortleRow.className = "pin-details__lp-row";

        const bortleLabel = document.createElement("label");

        bortleLabel.className = "pin-details__lp-label";
        bortleLabel.textContent = "Max Bortle";

        this.bortleInput = document.createElement("input");
        this.bortleInput.type = "number";
        this.bortleInput.className = "pin-details__lp-input";
        this.bortleInput.min = "1";
        this.bortleInput.max = "9";
        this.bortleInput.value = "4";
        this.bortleInput.setAttribute("aria-label", "Maximum Bortle class (1 = darkest, 9 = brightest)");

        bortleRow.append(bortleLabel, this.bortleInput);

        this.lpButton = document.createElement("button");
        this.lpButton.type = "button";
        this.lpButton.className = "pin-details__lp-btn";
        this.lpButton.textContent = "Apply light pollution filter";

        this.lpButton.addEventListener("click", () => {
            if (this.pin === null) {
                return;
            }

            if (this.lightPollutionFilterActive) {
                this.emitLightPollutionFilterRemoved(this.pin);
            } else {
                const maxBortle = parseInt(this.bortleInput.value, 10);

                this.emitLightPollutionFilterRequested(this.pin, {
                    maxBortle: isNaN(maxBortle) ? 4 : maxBortle,
                });
            }
        });

        this.lpUnitNote = document.createElement("p");
        this.lpUnitNote.className = "pin-details__lp-unit";
        this.lpUnitNote.hidden = true;

        this.lpRerunBtn = document.createElement("button");
        this.lpRerunBtn.type = "button";
        this.lpRerunBtn.className = "pin-details__rerun-btn";
        this.lpRerunBtn.textContent = "↺ Recompute reachable areas";
        this.lpRerunBtn.hidden = true;

        this.lpRerunBtn.addEventListener("click", () => {
            if (!this.pin) return;
            const maxBortle = parseInt(this.bortleInput.value, 10);
            this.emitRerunLightPollutionOnWalking(this.pin, { maxBortle: isNaN(maxBortle) ? 4 : maxBortle });
        });

        this.lpControls.append(bortleRow, this.lpUnitNote, this.lpButton, this.lpRerunBtn);

        section.append(sectionTitle, this.lpUnavailableNote, this.lpControls);

        return section;
    }

    createInformationRow(label, valueElement) {
        const row = document.createElement("div");

        row.className = "pin-details__row";

        const term = document.createElement("dt");
        term.textContent = label;

        const description = document.createElement("dd");
        description.appendChild(valueElement);

        row.append(term, description);

        return row;
    }

    setMode(mode) {
        this.selectedMode = mode;

        const isDriving = mode === "driving";

        this.drivingButton.classList.toggle("pin-details__mode-btn--active", isDriving);
        this.drivingButton.setAttribute("aria-pressed", String(isDriving));

        this.walkingButton.classList.toggle("pin-details__mode-btn--active", !isDriving);
        this.walkingButton.setAttribute("aria-pressed", String(!isDriving));
    }

    setIsochroneActive(isActive) {
        this.isochroneActive = isActive;
        this.isochroneButton.textContent = isActive
            ? "Remove isochrone"
            : "Show reachable area";
        this.isochroneButton.classList.toggle(
            "pin-details__isochrone-btn--active",
            isActive
        );

        // Sub-filters only make sense when there is an isochrone to narrow down.
        this.elevationSection.hidden = !isActive;
        this.horizonSection.hidden = !isActive;
        this.cloudSection.hidden = !isActive;
        this.lightPollutionSection.hidden = !isActive;
        this.intersectSection.hidden = !isActive;

        if (!isActive) {
            this.setElevationFilterActive(false);
            this.setHorizonFilterActive(false);
            this.setCloudFilterActive(false);
            this.setLightPollutionFilterActive(false);
            this.setIntersectActive(false);
            this.setIntersectAvailable(0);
        }
    }

    setHorizonFilterActive(isActive) {
        this.horizonFilterActive = isActive;
        this.horizonButton.textContent = isActive
            ? "Remove horizon filter"
            : "Apply horizon filter";
        this.horizonButton.classList.toggle(
            "pin-details__horizon-btn--active",
            isActive
        );
        this._syncRerunButtons();
    }

    setHorizonFilterLoading(isLoading) {
        this.horizonButton.disabled = isLoading;
        this.skyFractionInput.disabled = isLoading;

        if (isLoading) {
            this.horizonButton.textContent = "Computing…";
        } else {
            this.setHorizonFilterActive(this.horizonFilterActive);
        }
    }

    setCloudFilterActive(isActive, fetchedAt = null) {
        this.cloudFilterActive = isActive;
        this.cloudButton.textContent = isActive
            ? "Remove cloud filter"
            : "Apply cloud filter";
        this.cloudButton.classList.toggle(
            "pin-details__cloud-btn--active",
            isActive
        );
        this._syncRerunButtons();

        if (isActive && fetchedAt) {
            const date = new Date(fetchedAt);
            this.cloudFetchedAt.textContent =
                `Data as of ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
            this.cloudFetchedAt.hidden = false;
        } else {
            this.cloudFetchedAt.hidden = true;
        }
    }

    setCloudFilterLoading(isLoading) {
        this.cloudButton.disabled = isLoading;
        this.cloudSkyInput.disabled = isLoading;

        if (isLoading) {
            this.cloudButton.textContent = "Fetching…";
        } else {
            this.setCloudFilterActive(this.cloudFilterActive);
        }
    }

    setIntersectAvailable(activeFilterCount) {
        this.intersectButton.disabled = activeFilterCount < 2 && !this.intersectActive;
        if (!this.intersectActive) {
            this.intersectButton.textContent =
                activeFilterCount >= 2
                    ? `Intersect ${activeFilterCount} filters`
                    : "Intersect filters";
        }
    }

    setIntersectActive(isActive) {
        this.intersectActive = isActive;
        this.intersectButton.textContent = isActive
            ? "Remove intersection"
            : "Intersect filters";
        this.intersectButton.disabled = false;
        this.intersectButton.classList.toggle(
            "pin-details__intersect-btn--active",
            isActive
        );

        this.parkingsSection.hidden = !isActive;

        if (!isActive) {
            this.setParkingsActive(false);
        }
    }

    setIntersectLoading(isLoading) {
        this.intersectButton.disabled = isLoading;

        if (isLoading) {
            this.intersectButton.textContent = "Computing…";
        } else {
            this.setIntersectActive(this.intersectActive);
        }
    }

    setParkingsActive(isActive, count = null) {
        this.parkingsActive = isActive;
        if (isActive && count !== null) {
            this.parkingsButton.textContent =
                count === 0 ? "No parkings found" : `Clear ${count} parking${count === 1 ? "" : "s"}`;
        } else {
            this.parkingsButton.textContent = "Find parkings";
        }
        this.parkingsButton.classList.toggle(
            "pin-details__parkings-btn--active",
            isActive && count > 0
        );
        this.parkingsButton.disabled = isActive && count === 0;

        this.walkingSubsection.hidden = !isActive || count === 0;

        if (!isActive) {
            this.setWalkingReachableActive(false);
        }
    }

    setParkingsLoading(isLoading) {
        this.parkingsButton.disabled = isLoading;

        if (isLoading) {
            this.parkingsButton.textContent = "Searching…";
        } else {
            this.setParkingsActive(this.parkingsActive);
        }
    }

    setWalkingReachableActive(isActive) {
        this.walkingReachableActive = isActive;
        this.walkingReachableBtn.textContent = isActive
            ? "Remove reachable areas"
            : "Reachable from parkings";
        this.walkingReachableBtn.classList.toggle("pin-details__walking-btn--active", isActive);
        this.terrainSubsection.hidden = !isActive;
        this.localHorizonSubsection.hidden = !isActive;
        if (!isActive) {
            this.setTerrainFilterActive(false);
            this.setLocalHorizonFilterActive(false);
        }
        this._syncRerunButtons();
    }

    setWalkingReachableLoading(isLoading) {
        this.walkingReachableBtn.disabled = isLoading;
        this.walkingMinutesInput.disabled = isLoading;

        if (isLoading) {
            this.walkingReachableBtn.textContent = "Computing…";
            this.elevationRerunBtn.disabled = true;
            this.horizonRerunBtn.disabled = true;
            this.cloudRerunBtn.disabled = true;
            this.lpRerunBtn.disabled = true;
            this.terrainBtn.disabled = true;
            this.terrainBufferInput.disabled = true;
            this.localHorizonBtn.disabled = true;
            this.localHorizonInput.disabled = true;
        } else {
            this.setWalkingReachableActive(this.walkingReachableActive);
            this.elevationRerunBtn.disabled = false;
            this.horizonRerunBtn.disabled = false;
            this.cloudRerunBtn.disabled = false;
            this.lpRerunBtn.disabled = false;
            this.terrainBtn.disabled = false;
            this.terrainBufferInput.disabled = false;
            this.localHorizonBtn.disabled = false;
            this.localHorizonInput.disabled = false;
        }
    }

    _syncRerunButtons() {
        const show = this.walkingReachableActive;
        this.elevationRerunBtn.hidden = !show;
        this.horizonRerunBtn.hidden = !show;
        this.cloudRerunBtn.hidden = !show;
        this.lpRerunBtn.hidden = !show;
    }

    setTerrainFilterActive(isActive) {
        this.terrainFilterActive = isActive;
        this.terrainBtn.textContent = isActive
            ? "Remove terrain filter"
            : "Filter forests & buildings";
        this.terrainBtn.classList.toggle("pin-details__terrain-btn--active", isActive);
        this.terrainBufferInput.disabled = isActive;
    }

    setTerrainFilterLoading(isLoading) {
        this.terrainBtn.disabled = isLoading;
        this.terrainBufferInput.disabled = isLoading;
        if (isLoading) {
            this.terrainBtn.textContent = "Computing…";
        } else {
            this.setTerrainFilterActive(this.terrainFilterActive);
        }
    }

    setLocalHorizonFilterActive(isActive) {
        this.localHorizonFilterActive = isActive;
        this.localHorizonBtn.textContent = isActive
            ? "Remove local horizon filter"
            : "Apply local horizon";
        this.localHorizonBtn.classList.toggle("pin-details__local-horizon-btn--active", isActive);
        this.localHorizonInput.disabled = isActive;
    }

    setLocalHorizonFilterLoading(isLoading) {
        this.localHorizonBtn.disabled = isLoading;
        this.localHorizonInput.disabled = isLoading;
        if (isLoading) {
            this.localHorizonBtn.textContent = "Computing…";
        } else {
            this.setLocalHorizonFilterActive(this.localHorizonFilterActive);
        }
    }

    setLightPollutionDatasetAvailable(available) {
        this.lightPollutionDatasetAvailable = available;
        this.lpUnavailableNote.hidden = available;
        this.lpControls.hidden = !available;
    }

    setLightPollutionUnit(label) {
        if (label) {
            this.lpUnitNote.textContent = `Dataset unit: ${label}`;
            this.lpUnitNote.hidden = false;
        } else {
            this.lpUnitNote.hidden = true;
        }
    }

    setLightPollutionFilterActive(isActive) {
        this.lightPollutionFilterActive = isActive;
        this.lpButton.textContent = isActive
            ? "Remove light pollution filter"
            : "Apply light pollution filter";
        this.lpButton.classList.toggle(
            "pin-details__lp-btn--active",
            isActive
        );
        this._syncRerunButtons();
    }

    setLightPollutionFilterLoading(isLoading) {
        this.lpButton.disabled = isLoading;
        this.bortleInput.disabled = isLoading;

        if (isLoading) {
            this.lpButton.textContent = "Computing…";
        } else {
            this.setLightPollutionFilterActive(this.lightPollutionFilterActive);
        }
    }

    setElevationFilterActive(isActive) {
        this.elevationFilterActive = isActive;
        this.elevationButton.textContent = isActive
            ? "Remove elevation filter"
            : "Apply elevation filter";
        this.elevationButton.classList.toggle(
            "pin-details__elevation-btn--active",
            isActive
        );
        this._syncRerunButtons();
    }

    setElevationFilterLoading(isLoading) {
        this.elevationButton.disabled = isLoading;
        this.elevationInput.disabled = isLoading;

        if (isLoading) {
            this.elevationButton.textContent = "Computing…";
        } else {
            this.setElevationFilterActive(this.elevationFilterActive);
        }
    }

    setIsochroneLoading(isLoading) {
        this.isochroneButton.disabled = isLoading;
        this.minutesInput.disabled = isLoading;
        this.drivingButton.disabled = isLoading;
        this.walkingButton.disabled = isLoading;

        if (isLoading) {
            this.isochroneButton.textContent = "Computing…";
        } else {
            this.setIsochroneActive(this.isochroneActive);
        }
    }

    show(pin) {
        if (!(pin instanceof Pin)) {
            throw new TypeError("PinDetails.show() requires a Pin.");
        }

        this.pin = pin;

        this.labelInput.value = pin.label ?? "";

        this.latitudeValue.textContent =
            pin.location.latitude.toFixed(6);

        this.longitudeValue.textContent =
            pin.location.longitude.toFixed(6);

        this.sourceValue.textContent = pin.source;

        const lat = pin.location.latitude.toFixed(6);
        const lon = pin.location.longitude.toFixed(6);
        this.googleMapsLink.href = `https://www.google.com/maps?q=${lat},${lon}`;

        this.setIsochroneActive(false);
        this.setIsochroneLoading(false);
        this.setElevationFilterActive(false);
        this.setElevationFilterLoading(false);
        this.setHorizonFilterActive(false);
        this.setHorizonFilterLoading(false);
        this.setCloudFilterActive(false);
        this.setCloudFilterLoading(false);
        this.setLightPollutionFilterActive(false);
        this.setLightPollutionFilterLoading(false);
        this.setIntersectActive(false);
        this.setIntersectAvailable(0);
        this.setWalkingReachableActive(false);
        this.setTerrainFilterActive(false);
        this.setLocalHorizonFilterActive(false);

        this.element.hidden = false;
    }

    hide() {
        this.pin = null;
        this.element.hidden = true;
    }

    onDeleteRequested(callback) {
        this.deleteListeners.add(callback);

        return () => {
            this.deleteListeners.delete(callback);
        };
    }

    onLabelChanged(callback) {
        this.labelChangedListeners.add(callback);

        return () => {
            this.labelChangedListeners.delete(callback);
        };
    }

    onIsochroneRequested(callback) {
        this.isochroneRequestedListeners.add(callback);

        return () => {
            this.isochroneRequestedListeners.delete(callback);
        };
    }

    onIsochroneRemoved(callback) {
        this.isochroneRemovedListeners.add(callback);

        return () => {
            this.isochroneRemovedListeners.delete(callback);
        };
    }

    onElevationFilterRequested(callback) {
        this.elevationFilterRequestedListeners.add(callback);

        return () => {
            this.elevationFilterRequestedListeners.delete(callback);
        };
    }

    onElevationFilterRemoved(callback) {
        this.elevationFilterRemovedListeners.add(callback);

        return () => {
            this.elevationFilterRemovedListeners.delete(callback);
        };
    }

    emitDeleteRequested(pin) {
        for (const callback of this.deleteListeners) {
            callback(pin);
        }
    }

    emitLabelChanged(pin, newLabel) {
        for (const callback of this.labelChangedListeners) {
            callback(pin, newLabel);
        }
    }

    emitIsochroneRequested(pin, options) {
        for (const callback of this.isochroneRequestedListeners) {
            callback(pin, options);
        }
    }

    emitIsochroneRemoved(pin) {
        for (const callback of this.isochroneRemovedListeners) {
            callback(pin);
        }
    }

    emitElevationFilterRequested(pin, options) {
        for (const callback of this.elevationFilterRequestedListeners) {
            callback(pin, options);
        }
    }

    emitElevationFilterRemoved(pin) {
        for (const callback of this.elevationFilterRemovedListeners) {
            callback(pin);
        }
    }

    onHorizonFilterRequested(callback) {
        this.horizonFilterRequestedListeners.add(callback);

        return () => {
            this.horizonFilterRequestedListeners.delete(callback);
        };
    }

    onHorizonFilterRemoved(callback) {
        this.horizonFilterRemovedListeners.add(callback);

        return () => {
            this.horizonFilterRemovedListeners.delete(callback);
        };
    }

    emitHorizonFilterRequested(pin, options) {
        for (const callback of this.horizonFilterRequestedListeners) {
            callback(pin, options);
        }
    }

    emitHorizonFilterRemoved(pin) {
        for (const callback of this.horizonFilterRemovedListeners) {
            callback(pin);
        }
    }

    onLightPollutionFilterRequested(callback) {
        this.lightPollutionFilterRequestedListeners.add(callback);

        return () => {
            this.lightPollutionFilterRequestedListeners.delete(callback);
        };
    }

    onLightPollutionFilterRemoved(callback) {
        this.lightPollutionFilterRemovedListeners.add(callback);

        return () => {
            this.lightPollutionFilterRemovedListeners.delete(callback);
        };
    }

    emitLightPollutionFilterRequested(pin, options) {
        for (const callback of this.lightPollutionFilterRequestedListeners) {
            callback(pin, options);
        }
    }

    emitLightPollutionFilterRemoved(pin) {
        for (const callback of this.lightPollutionFilterRemovedListeners) {
            callback(pin);
        }
    }

    onCloudFilterRequested(callback) {
        this.cloudFilterRequestedListeners.add(callback);

        return () => {
            this.cloudFilterRequestedListeners.delete(callback);
        };
    }

    onCloudFilterRemoved(callback) {
        this.cloudFilterRemovedListeners.add(callback);

        return () => {
            this.cloudFilterRemovedListeners.delete(callback);
        };
    }

    emitCloudFilterRequested(pin, options) {
        for (const callback of this.cloudFilterRequestedListeners) {
            callback(pin, options);
        }
    }

    emitCloudFilterRemoved(pin) {
        for (const callback of this.cloudFilterRemovedListeners) {
            callback(pin);
        }
    }

    onIntersectRequested(callback) {
        this.intersectRequestedListeners.add(callback);

        return () => {
            this.intersectRequestedListeners.delete(callback);
        };
    }

    onIntersectRemoved(callback) {
        this.intersectRemovedListeners.add(callback);

        return () => {
            this.intersectRemovedListeners.delete(callback);
        };
    }

    emitIntersectRequested(pin) {
        for (const callback of this.intersectRequestedListeners) {
            callback(pin);
        }
    }

    emitIntersectRemoved(pin) {
        for (const callback of this.intersectRemovedListeners) {
            callback(pin);
        }
    }

    onParkingsRequested(callback) {
        this.parkingsRequestedListeners.add(callback);

        return () => {
            this.parkingsRequestedListeners.delete(callback);
        };
    }

    onParkingsRemoved(callback) {
        this.parkingsRemovedListeners.add(callback);

        return () => {
            this.parkingsRemovedListeners.delete(callback);
        };
    }

    emitParkingsRequested(pin) {
        for (const callback of this.parkingsRequestedListeners) {
            callback(pin);
        }
    }

    emitParkingsRemoved(pin) {
        for (const callback of this.parkingsRemovedListeners) {
            callback(pin);
        }
    }

    onWalkingReachableRequested(callback) {
        this.walkingReachableRequestedListeners.add(callback);
        return () => { this.walkingReachableRequestedListeners.delete(callback); };
    }

    onWalkingReachableRemoved(callback) {
        this.walkingReachableRemovedListeners.add(callback);
        return () => { this.walkingReachableRemovedListeners.delete(callback); };
    }

    emitWalkingReachableRequested(pin, options) {
        for (const cb of this.walkingReachableRequestedListeners) cb(pin, options);
    }

    emitWalkingReachableRemoved(pin) {
        for (const cb of this.walkingReachableRemovedListeners) cb(pin);
    }

    onRerunElevationOnWalking(callback) {
        this.rerunElevationOnWalkingListeners.add(callback);
        return () => { this.rerunElevationOnWalkingListeners.delete(callback); };
    }

    onRerunHorizonOnWalking(callback) {
        this.rerunHorizonOnWalkingListeners.add(callback);
        return () => { this.rerunHorizonOnWalkingListeners.delete(callback); };
    }

    onRerunCloudOnWalking(callback) {
        this.rerunCloudOnWalkingListeners.add(callback);
        return () => { this.rerunCloudOnWalkingListeners.delete(callback); };
    }

    onRerunLightPollutionOnWalking(callback) {
        this.rerunLightPollutionOnWalkingListeners.add(callback);
        return () => { this.rerunLightPollutionOnWalkingListeners.delete(callback); };
    }

    emitRerunElevationOnWalking(pin, params) {
        for (const cb of this.rerunElevationOnWalkingListeners) cb(pin, params);
    }

    emitRerunHorizonOnWalking(pin, params) {
        for (const cb of this.rerunHorizonOnWalkingListeners) cb(pin, params);
    }

    emitRerunCloudOnWalking(pin, params) {
        for (const cb of this.rerunCloudOnWalkingListeners) cb(pin, params);
    }

    emitRerunLightPollutionOnWalking(pin, params) {
        for (const cb of this.rerunLightPollutionOnWalkingListeners) cb(pin, params);
    }

    onTerrainFilterRequested(callback) {
        this.terrainFilterRequestedListeners.add(callback);
        return () => { this.terrainFilterRequestedListeners.delete(callback); };
    }

    onTerrainFilterRemoved(callback) {
        this.terrainFilterRemovedListeners.add(callback);
        return () => { this.terrainFilterRemovedListeners.delete(callback); };
    }

    emitTerrainFilterRequested(pin, params) {
        for (const cb of this.terrainFilterRequestedListeners) cb(pin, params);
    }

    emitTerrainFilterRemoved(pin) {
        for (const cb of this.terrainFilterRemovedListeners) cb(pin);
    }

    onLocalHorizonFilterRequested(callback) {
        this.localHorizonFilterRequestedListeners.add(callback);
        return () => { this.localHorizonFilterRequestedListeners.delete(callback); };
    }

    onLocalHorizonFilterRemoved(callback) {
        this.localHorizonFilterRemovedListeners.add(callback);
        return () => { this.localHorizonFilterRemovedListeners.delete(callback); };
    }

    emitLocalHorizonFilterRequested(pin, params) {
        for (const cb of this.localHorizonFilterRequestedListeners) cb(pin, params);
    }

    emitLocalHorizonFilterRemoved(pin) {
        for (const cb of this.localHorizonFilterRemovedListeners) cb(pin);
    }
}
