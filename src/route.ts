/**
 * Svelte Router route module.
 * @module svelte-router/route
 */

import tc from '@spaceavocado/type-check';
import {
  fullURL,
  deepClone,
  isWholeNumber,
  isFloatNumber,
} from './utils';
import {HISTORY_ACTION} from './history';
import {Location} from './location';
import {Key} from 'path-to-regexp';

/**
 * Route redirect.
 * * string: plain URL.
 * * object: route name {name: 'ROUTE'}.
 * * function: callback function fn(to) to resolve the redirect.
 */
export type routeRedirect = null | string | object | ((to: Route) => string);

/**
 * Props passed to component.
 * * false: default. do not resolve props.
 * * true: auto-resolve props from route params.
 * * object: pass this object directly to component as props.
 * * function: callback function to resolve props from route object.
 * fn(router) => props.
 */
type routeProps = boolean | object | ((route: Route) => {[k: string]: string});
export type componentModule = {default: object};

/**
 * Route config prefab used to generate Route RouteConfig.
 */
export interface RouteConfigPrefab {
  /** Name of the route. */
  name?: string;
  /** URL path use to resolve the route. */
  path: string;
  redirect?: routeRedirect;
  /**
   * Svelte component.
   * Component constructor function or async component resolver
   */
  component?: boolean | (() => object) | Promise<componentModule>;
  /** Route meta object. */
  meta?: {[k: string]: string};
  props?: routeProps;
  /** Children routes. */
  children?: RouteConfigPrefab[];
}

/**
 * Route Config
 */
export interface RouteConfig extends RouteConfigPrefab {
  /** Route unique ID. */
  id: symbol;
  /** Lazy loaded component flag. */
  async: boolean;
  /** Parent route. */
  parent: RouteConfig | null;
  /** Collection of param keys generated by the pathToRegexp. */
  paramKeys: Partial<Key>[];
  /** Regex URL matcher */
  matcher: RegExp;
  /**
   * URL generator function.
   * @param params router param dictionary.
   */
  generator: (params: {[k: string]: string}) => string;
  /** Children routes. */
  children: RouteConfig[];
}

/**
 * Create route config object.
 * @param {module:svelte-router/route~RouteConfig} prefab route config prefab,
 * only properties defined on svelte-router/route~RouteConfig will be used.
 * @throws Will throw an error if the route prefab config is invalid.
 * @return {module:svelte-router/route~RouteConfig}
 */
export function createRouteConfig(prefab: RouteConfigPrefab): RouteConfig {
  if (tc.isNullOrUndefined(prefab) || tc.not.isObject(prefab)) {
    throw new Error('invalid route config prefab');
  }
  if (tc.isNullOrUndefined(prefab.path) || tc.not.isString(prefab.path)) {
    throw new Error('invalid route config path property');
  }
  if (tc.not.isNullOrUndefined(prefab.component)
    && tc.not.isFunction(prefab.component)
    && tc.not.isPromise(prefab.component)
  ) {
    throw new Error('invalid route config component property');
  }
  if (prefab.meta && tc.not.isObject(prefab.meta)) {
    throw new Error('invalid route config meta property');
  }

  if (tc.isNullOrUndefined(prefab.redirect)) {
    prefab.redirect = null;
  } else if (tc.not.isString(prefab.redirect)
    && tc.not.isObject(prefab.redirect)
    && tc.not.isFunction(prefab.redirect)) {
    throw new Error('invalid route config redirect property');
  }

  if (tc.isNullOrUndefined(prefab.props)) {
    prefab.props = false;
  } else if (prefab.props !== true
    && tc.not.isObject(prefab.props)
    && tc.not.isFunction(prefab.props)) {
    throw new Error('invalid route config props property');
  }

  return {
    id: Symbol('Route ID'),
    path: prefab.path,
    redirect: prefab.redirect,
    component: prefab.component || false,
    async: tc.not.isNullOrUndefined(prefab.component)
      && tc.isPromise(prefab.component),
    name: prefab.name,
    meta: prefab.meta,
    props: prefab.props,
    children: [],
    parent: null,
    paramKeys: [],
    matcher: /^\s$/,
    generator: (): string => '',
  };
}

/**
 * Route record.
 */
export interface Record {
  /** Route RouteConfig ID. */
  id: symbol;
  /** Name of the route. */
  name?: string;
  /** URL path use to resolve the route. */
  path: string;
  redirect?: routeRedirect;
  /** Svelte component. */
  component: boolean | (() => object) | Promise<componentModule>;
  /** Lazy loaded component flag. */
  async: boolean;
  /** Route meta object. */
  meta?: {[k: string]: string};
  /** Route params */
  params: {[k: string]: string};
  props?: routeProps;
}

/**
 * Create route record.
 * @param {RouteConfig} route Matching route config.
 * @param {string[]|object} params Regex exec output or params object.
 * @return {Record}
 */
export function createRouteRecord(
    route: RouteConfig,
    params: string[] | {[k: string]: string | number}): Record {
  const record: Record = {
    id: route.id,
    path: route.path,
    redirect: route.redirect,
    name: route.name,
    component: route.component || false,
    async: route.async,
    meta: route.meta,
    props: route.props,
    params: {},
  };

  /**
   * Convert value to number if possible.
   * @param {string} s Tested string.
   * @return {string|number}
   */
  const resolveNumber = (s: string | number): string | number => {
    if (tc.isNumber(s)) {
      return s as number;
    }
    if (isWholeNumber(s as string)) {
      return parseInt(s as string);
    } else if (isFloatNumber(s as string)) {
      return parseFloat(s as string);
    }
    return s;
  };

  // Regex array setter
  let setParamValue = (
      key: string,
      collection: {[k: string]: string | number},
      index: number): void => {
    index++;
    if (index < params.length) {
      collection[key] = resolveNumber((params as string[])[index]);
    }
  };

  // Object setter
  if (tc.isObject(params)) {
    setParamValue = (
        key: string,
        collection: {[k: string]: string | number}): void => {
      if (tc.not.isNullOrUndefined((params as {[k: string]: string})[key])) {
        collection[key] = resolveNumber((params as {[k: string]: string})[key]);
      }
    };
  }

  // Params
  for (let i = 0; i < route.paramKeys.length; i++) {
    setParamValue(route.paramKeys[i].name as string, record.params, i);
  }

  return record;
}

/**
 * Route object.
 */
export interface Route {
  /** Name of the route. */
  name?: string;
  redirect?: routeRedirect;
  /** Router URL without hash or query params */
  path: string;
  /** URL hash. */
  hash: string;
  /** Router full URL. */
  fullPath: string;
  /** Query parameters. */
  query: {[k: string]: string};
  /** Captured router parameters. */
  params: {[k: string]: string};
  /** Route meta props. */
  meta?: {[k: string]: string};
  /** History action. */
  action: HISTORY_ACTION;
  /** Collection of matched router records (top-bottom). */
  matched: Record[];
}

/**
 * Create route object.
 * @param {Location} location triggered location.
 * @param {Record[]} matches collection of matched route records.
 * @return {Route}
 */
export function createRoute(location: Location, matches: Record[]): Route {
  // Get the last route in the stack as the resolved route
  const route = matches[matches.length-1];
  return {
    name: route.name,
    action: location.action,
    path: location.path,
    redirect: route.redirect,
    hash: location.hash,
    fullPath: fullURL(location.path, location.query, location.hash),
    params: route.params,
    query: location.query,
    meta: route.meta,
    matched: matches,
  };
};

/**
 * Deep clone route.
 * @param {Route} route source route.
 * @return {Route}
 */
export function cloneRoute(route: Route): Route {
  if (route == null) {
    return {} as Route;
  }
  const clone = deepClone(route) as Route;
  clone.redirect = route.redirect;
  for (let i = 0; i < route.matched.length; i++) {
    clone.matched[i].component = route.matched[i].component;
    clone.matched[i].props = route.matched[i].props;
    clone.matched[i].meta = route.matched[i].meta;
    clone.matched[i].redirect = route.matched[i].redirect;
  }
  return clone;
}
