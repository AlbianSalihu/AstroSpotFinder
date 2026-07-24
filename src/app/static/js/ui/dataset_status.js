const VIIRS_URL = "https://eogdata.mines.edu/nighttime_light/annual/";
const DATASET_PATH_HINT = "data/light_pollution/light_pollution.tif";


export class DatasetStatus {
    constructor({ mountPoint = document.body } = {}) {
        this.downloadListeners = new Set();

        this.element = this.createElement();
        mountPoint.appendChild(this.element);

        // Show a neutral state immediately so the button is visible before the API responds
        this.update({ available: false, downloading: false, error: null, is_outdated: false });
    }

    createElement() {
        const panel = document.createElement("div");

        panel.className = "dataset-status";

        this.indicator = document.createElement("span");
        this.indicator.className = "dataset-status__indicator";

        this.label = document.createElement("span");
        this.label.className = "dataset-status__label";

        this.actionButton = document.createElement("button");
        this.actionButton.type = "button";
        this.actionButton.className = "dataset-status__action";

        this.actionButton.addEventListener("click", () => {
            this.emitDownloadRequested();
        });

        this.upgradeInfo = document.createElement("div");
        this.upgradeInfo.className = "dataset-status__upgrade";
        this.upgradeInfo.hidden = true;

        const upgradeText = document.createElement("p");
        upgradeText.className = "dataset-status__upgrade-text";
        upgradeText.textContent =
            "Download a VIIRS VNL annual composite " +
            "(median_masked .tif.gz), then place the extracted .tif at:";

        const pathHint = document.createElement("code");
        pathHint.className = "dataset-status__path";
        pathHint.textContent = DATASET_PATH_HINT;

        const virsLink = document.createElement("a");
        virsLink.className = "dataset-status__link";
        virsLink.href = VIIRS_URL;
        virsLink.target = "_blank";
        virsLink.rel = "noopener noreferrer";
        virsLink.textContent = "Open VIIRS data portal";

        this.upgradeInfo.append(upgradeText, pathHint, virsLink);

        panel.append(
            this.indicator,
            this.label,
            this.actionButton,
            this.upgradeInfo
        );

        return panel;
    }

    update(status) {
        this.upgradeInfo.hidden = true;
        this.actionButton.disabled = false;
        this.actionButton.hidden = false;

        if (status.downloading) {
            this.indicator.className =
                "dataset-status__indicator dataset-status__indicator--loading";
            this.label.textContent = "Light pollution: downloading…";
            this.actionButton.hidden = true;
            return;
        }

        if (status.error) {
            this.indicator.className =
                "dataset-status__indicator dataset-status__indicator--warn";

            this.label.textContent = status.error === "manual_download_required"
                ? "Light pollution: manual download required"
                : "Light pollution: download failed";

            this.actionButton.textContent = "Retry";
            this.upgradeInfo.hidden = false;
            return;
        }

        if (!status.available) {
            this.indicator.className =
                "dataset-status__indicator dataset-status__indicator--off";
            this.label.textContent = "Light pollution filter: not downloaded";
            this.actionButton.textContent = "Download";
            return;
        }

        if (status.is_outdated) {
            this.indicator.className =
                "dataset-status__indicator dataset-status__indicator--warn";

            const date = status.downloaded_at
                ? new Date(status.downloaded_at).toLocaleDateString()
                : "unknown date";

            this.label.textContent = `Light pollution: Falchi 2016 — outdated (downloaded ${date})`;
            this.actionButton.textContent = "Re-download";
            this.upgradeInfo.hidden = false;
            return;
        }

        this.indicator.className =
            "dataset-status__indicator dataset-status__indicator--ok";

        const date = status.downloaded_at
            ? new Date(status.downloaded_at).toLocaleDateString()
            : "unknown date";

        this.label.textContent = `Light pollution: ready (${date})`;
        this.actionButton.textContent = "Re-download";
    }

    onDownloadRequested(callback) {
        this.downloadListeners.add(callback);

        return () => {
            this.downloadListeners.delete(callback);
        };
    }

    emitDownloadRequested() {
        for (const callback of this.downloadListeners) {
            callback();
        }
    }
}
