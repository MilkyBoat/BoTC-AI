const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const cloneJsonValue = (value, seen) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") {
    throw new TypeError("协议数据只能包含 JSON 值");
  }
  if (seen.has(value)) throw new TypeError("协议数据不能包含循环引用");
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item) => cloneJsonValue(item, seen));
  } else if (isPlainObject(value)) {
    result = {};
    Object.keys(value).forEach((key) => {
      result[key] = cloneJsonValue(value[key], seen);
    });
  } else {
    throw new TypeError("协议数据只能包含普通对象和数组");
  }
  seen.delete(value);
  return result;
};

export const cloneJson = (value) => cloneJsonValue(value, new Set());

export const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
};

export const cloneAndFreezeJson = (value) => deepFreeze(cloneJson(value));

const canonicalizeValue = (value, seen) => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("协议数据只能包含 JSON 值");
  }
  if (seen.has(value)) throw new TypeError("协议数据不能包含循环引用");
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value
      .map((item) => canonicalizeValue(item, seen))
      .join(",")}]`;
  } else if (isPlainObject(value)) {
    result = `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeValue(value[key], seen)}`,
      )
      .join(",")}}`;
  } else {
    throw new TypeError("协议数据只能包含普通对象和数组");
  }
  seen.delete(value);
  return result;
};

export const canonicalizeJson = (value) => canonicalizeValue(value, new Set());
