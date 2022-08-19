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

    if (entry.result !== pendingSymbol) {
      const result = entry.result as T;
      ssrState.delete(id);

      return result;
    }

    if (entry.promise) return null;

    entry.promise = new Promise<void>((resolve) => {
      cb().then((result) => {
        entry.promise = null;
        entry.result = result;

        resolve();
      });
    });

    return null;
  };
};

const waitForAllPromises = async () => {
  for (const { promise } of ssrState.values()) {
    if (!promise) continue;

    await promise;
  }
};

const Context = createContext('defaultContextValue');

const ssrRunnerA = makeSSRRunner<string>();
const ssrRunnerB = makeSSRRunner<string>();

const ProviderComponent: FC<PropsWithChildren<{ defaultValue: string }>> = ({
  children,
  defaultValue,
}) => {
  const [stateA, setStateA] = useState<string | null>(null);

  const [stateB, setStateB] = useState(
    [defaultValue, 'setState_initialState'].join('\n')
  );

  const value = useMemo(
    () => [defaultValue, 'useMemo'].join('\n'),
    [defaultValue]
  );

  useEffect(() => {
    if (!stateA) return;

    const uuid = randomUUID();

    const asyncValue = ssrRunnerB(() =>
      resolveAfterWith(2000, null).then(() => stateA)
    );

    setStateB(
      [
        value,
        'useEffect',
        'async',
        'setState',
        uuid,
        asyncValue || 'null',
      ].join('\n')
    );
  }, [stateA]);

  useEffect(() => {
    const uuid = randomUUID();

    const asyncValue = ssrRunnerA(() =>
      resolveAfterWith(2000, ['asyncResult', uuid].join('\n'))
    );
    if (!asyncValue) return;

    setStateA(asyncValue);
  }, [value]);

  return <Context.Provider value={stateB}>{children}</Context.Provider>;
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

do {
  await waitForAllPromises();
  console.log(render());
  console.log('\n');
} while (ssrState.size);
