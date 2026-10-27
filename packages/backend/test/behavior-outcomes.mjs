/** Version 2 measurement: incidental SQL/provider attempts never prove intended success. */
export function observedOutcome({positiveControl,httpOk,httpStatus,unsupported,negativeEnvelope,sessionEffect,principalProjection,counterfactual,hasStateObservation,providerAttempts}){
    if(positiveControl===false)return 'failed-positive-control';
    if(!httpOk)return unsupported||httpStatus===501?'unsupported':'refusal-observed';
    if(negativeEnvelope)return 'negative-envelope';
    if(sessionEffect)return 'session-effect-observed';
    if(principalProjection)return 'principal-projection';
    if(positiveControl===true&&counterfactual?.supportIntact&&counterfactual.positiveControl===false)return 'verified-read';
    if(positiveControl===true)return 'positive-control';
    return !hasStateObservation&&!providerAttempts?'static-response':'inconclusive';
}
