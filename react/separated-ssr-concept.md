SSR:
render (has no initial car) -> CarProvider -> async fetch car ... -> storeInState

SSR (separate async):
async fetch car ... -> render -> CarProvider (already has car)

CSR:
restore SSR state -> render -> CarProvider (gets initial value from SSR state)
