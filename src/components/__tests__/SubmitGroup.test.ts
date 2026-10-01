import { ApiError } from '@/api/errors';
import { useNotices } from '@/lib/notice';

import { createSubmitGroup, reportSubmitError } from '../SubmitGroup';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('createSubmitGroup', () => {
  it('runs one control at a time and frees the group when it settles', async () => {
    const group = createSubmitGroup();
    const first = deferred<string>();
    const listener = jest.fn();
    group.subscribe(listener);

    const running = group.run('save', () => first.promise);
    expect(group.getPending()).toBe('save');
    expect(group.run('publish', async () => 'never')).toBeNull();

    first.resolve('done');
    await expect(running).resolves.toBe('done');
    expect(group.getPending()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rejects with what the task threw and is free again', async () => {
    const group = createSubmitGroup();
    const error = new Error('nope');
    await expect(group.run('save', async () => Promise.reject(error))).rejects.toBe(error);
    expect(group.getPending()).toBeNull();
  });

  it('treats a task that throws synchronously like a rejection', async () => {
    const group = createSubmitGroup();
    const task = (): Promise<void> => {
      throw new Error('sync');
    };
    await expect(group.run('save', task)).rejects.toThrow('sync');
    expect(group.getPending()).toBeNull();
  });
});

describe('reportSubmitError', () => {
  beforeEach(() => useNotices.getState().clear());

  it('hands the error to the caller when it owns it', () => {
    const onError = jest.fn();
    const error = new ApiError({ status: 400, code: 'invalid', message: 'Bad' });
    reportSubmitError(error, onError);
    expect(onError).toHaveBeenCalledWith(error);
    expect(useNotices.getState().queue).toEqual([]);
  });

  it('shows the API message as an error notice', () => {
    reportSubmitError(new ApiError({ status: 409, code: 'taken', message: 'That code is taken.' }));
    expect(useNotices.getState().queue.map((q) => [q.tone, q.message])).toEqual([['err', 'That code is taken.']]);
  });

  it('stays quiet for errors handled globally', () => {
    for (const status of [401, 403, 426]) {
      reportSubmitError(new ApiError({ status, code: 'x', message: 'handled elsewhere' }));
    }
    reportSubmitError(new ApiError({ status: 0, code: 'aborted', message: 'aborted', kind: 'aborted' }));
    expect(useNotices.getState().queue).toEqual([]);
  });
});
