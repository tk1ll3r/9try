// The only file other features may import from this module.
export { onlineLabel } from "./domain/Online";
export { useFriendPresence } from "./presentation/useOnline";
export { useFriendModes } from "./presentation/useFriendModes";
export { useCustomModes, useCreateCustomMode } from "./presentation/useCustomModes";
export { CustomModeDialog } from "./presentation/CustomModeDialog";
export type { CustomActivityMode, CustomModeIcon } from "./domain/ActivityMode";
// The catalog of activities: its name, icon and color by key, and the ones offered for one tap.
export { choiceOf, choices, quickDefaults, type ModeChoice } from "./presentation/modes";
