const 陌客登记 = new Set(["good", "outsider", "evil", "minion", "demon"]);
const 间谍登记 = new Set(["evil", "minion", "good", "townsfolk", "outsider"]);

export const resolveTroubleBrewingRegistration = ({
  actualRoleId,
  actualAlignment,
  actualCharacterType,
  registeredAs,
}) => {
  const registeredRole = TROUBLE_BREWING_ROLE_BY_ID.get(registeredAs);
  const registeredAlignment = registeredRole?.alignment;
  const registeredCharacterType = registeredRole?.characterType;
  const allowed =
    registeredAs === actualAlignment ||
    registeredAs === actualCharacterType ||
    registeredAs === actualRoleId ||
    (actualRoleId === "recluse" &&
      (陌客登记.has(registeredAs) ||
        registeredAlignment === "evil" ||
        ["minion", "demon"].includes(registeredCharacterType))) ||
    (actualRoleId === "spy" &&
      (间谍登记.has(registeredAs) ||
        registeredAlignment === "good" ||
        ["townsfolk", "outsider"].includes(registeredCharacterType)));
  return Object.freeze({
    allowed,
    actualRoleId,
    actualAlignment,
    actualCharacterType,
    registeredAs,
    grantsAbility: false,
  });
};
import { TROUBLE_BREWING_ROLE_BY_ID } from "./catalog";
