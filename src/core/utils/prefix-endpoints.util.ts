import type { Endpoint } from "colyseus";

/** Mount endpoint definitions without mutating imported controllers or running their middleware twice. */
export function prefixEndpoints(
    prefix: string,
    endpoints: Record<string, Endpoint>
): Record<string, Endpoint> {
    return Object.fromEntries(
        Object.entries(endpoints).map(([key, endpoint]) => [
            key,
            Object.assign(endpoint.bind(null), endpoint, {
                path: `${prefix.replace(/\/$/, "")}${endpoint.path}`,
            }),
        ])
    );
}
