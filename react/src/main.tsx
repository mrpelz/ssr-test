import {
  createContext,
  FC,
  PropsWithChildren,
  useContext,
  useEffect as useEfectOriginal,
  useMemo,
  useState,
} from 'react';
import { renderToString } from 'react-dom/server';
import { randomUUID } from 'crypto';

const resolveAfterWith = <T,>(ms: number, value: T) => {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve(value);
    }, ms);
  });
};

const useEffect: typeof useEfectOriginal = (effect, deps) => {
  useMemo(effect, deps);
};

const pendingSymbol = Symbol('pending');

const ssrState = new Map<
  string,
  {
    promise: Promise<void> | null;
    result: unknown;
  }
>();

const makeSSRRunner = <T,>() => {
  const id = randomUUID();

  return (cb: () => Promise<T>): T | null => {
    const entry =
      ssrState.get(id) ||
      (() => {
        const newEntry = {
          promise: null,
          result: pendingSymbol,
        };

        ssrState.set(id, newEntry);

        return newEntry;
      })();

    if (entry.result !== pendingSymbol) return entry.result as T;

    entry.promise = new Promise<void>((resolve) => {
      cb().then((result) => {
        entry.result = result;
        resolve();
      });
    });

    return null;
  };
};

const waitForAllPromises = async () => {
  const allPromises = Array.from(ssrState.values())
    .map(({ promise }) => promise)
    .filter((promise): promise is Promise<void> => Boolean(promise));

  await Promise.all(allPromises);
};

const Context = createContext('defaultContextValue');

const ssrRunner = makeSSRRunner<string>();

const ProviderComponent: FC<PropsWithChildren<{ defaultValue: string }>> = ({
  children,
  defaultValue,
}) => {
  const [state, setState] = useState(
    [defaultValue, 'setState_initialState'].join('\n')
  );

  const value = useMemo(
    () => [defaultValue, 'useMemo'].join('\n'),
    [defaultValue]
  );

  useEffect(() => {
    const uuid = randomUUID();
    const asyncValue = ssrRunner(() =>
      resolveAfterWith(2000, ['asyncResult', uuid].join('\n'))
    );

    setState(
      [
        value,
        'useEffect',
        'async',
        'setState',
        uuid,
        asyncValue || 'null',
      ].join('\n')
    );
  }, [value]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
};

const useTheContext = () => useContext(Context);

const ConsumerComponent: FC = () => {
  const contextValue = useTheContext();

  return (
    <div id="consumer-component">
      {contextValue}
      {'\n'}
    </div>
  );
};

const render = () => {
  const RootTree = (
    <div id="root">
      <ProviderComponent defaultValue="providerPropDefaultValue">
        <ConsumerComponent />
      </ProviderComponent>
    </div>
  );

  return renderToString(RootTree);
};

console.log(render());
console.log('\n');

await waitForAllPromises();
console.log(render());
