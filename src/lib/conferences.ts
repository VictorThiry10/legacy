// The two conferences. Pure: used on the server (the schedule, the standings) and in the browser (the reveal).
export const CONFERENCES = { paris: "Paris", london: "London" } as const;
export type Conference = keyof typeof CONFERENCES;
export const isConference = (s: unknown): s is Conference => s === "paris" || s === "london";

// Who gets the reveal while it's being tried out: Victor first. Empty the list to open it to every GM.
export const REVEAL_TEST_ONLY = ["95b613dc-64b6-4d2f-8774-ba38fa257b60"];
