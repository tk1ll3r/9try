import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre 6's relative default URL breaks in Vite's optimized dependency folder.
// Vite emits the worker as a same-origin asset in dev and production.
setWorkerUrl(workerUrl);
export { Map, Marker, Popup, NavigationControl, LngLatBounds } from "maplibre-gl";
