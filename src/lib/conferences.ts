// The two conferences. Pure: used on the server (the schedule, the standings) and in the browser (the reveal).
export const CONFERENCES = { paris: "Paris", london: "London" } as const;
export type Conference = keyof typeof CONFERENCES;
export const isConference = (s: unknown): s is Conference => s === "paris" || s === "london";

// Who gets the reveal while it's being tried out (team ids). Empty: every GM.
export const REVEAL_TEST_ONLY: string[] = [];
