import scope from "../../../knowledge/rulesets/m1-ruleset-scope.json";
import { cloneAndFreezeJson } from "./immutable";

export const M1_RULESET_IDENTITY = cloneAndFreezeJson({
  id: scope.manifestId,
  version: scope.version,
  canonicalLanguage: scope.canonicalLanguage,
  sourceManifestVersion: scope.sourceManifestVersion,
  integrity: scope.integrity.value,
});
