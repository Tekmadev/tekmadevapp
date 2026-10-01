import { compareVersions, isBelowMinVersion, isUpdateAvailable, safeApkUrl } from '../appVersion';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.2', '1.2.0', 0],
    ['1.10.0', '1.9.3', 1],
    ['0.9.9', '1.0.0', -1],
    ['v2.0.0', '2.0.0', 0],
    ['1.2.3-beta.1', '1.2.3', 0],
    ['1.2.3+45', '1.2.4', -1],
    ['1.x.0', '1.0.0', 0],
  ] as const)('%s vs %s is %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
    expect(compareVersions(b, a)).toBe(expected === 0 ? 0 : -expected);
  });
});

describe('version gates', () => {
  const app = { latestVersion: '1.4.0', minVersion: '1.2.0', apkUrl: null };

  it('blocks only below the minimum', () => {
    expect(isBelowMinVersion(app, '1.1.9')).toBe(true);
    expect(isBelowMinVersion(app, '1.2.0')).toBe(false);
    expect(isBelowMinVersion(app, '1.3.0')).toBe(false);
  });

  it('offers an update only when behind the latest', () => {
    expect(isUpdateAvailable(app, '1.3.0')).toBe(true);
    expect(isUpdateAvailable(app, '1.4.0')).toBe(false);
    expect(isUpdateAvailable(app, '1.5.0')).toBe(false);
  });
});

describe('safeApkUrl', () => {
  it('keeps https links', () => {
    expect(safeApkUrl(' https://www.tekmadev.com/app/tekmadev-admin-1.4.0.apk ')).toBe(
      'https://www.tekmadev.com/app/tekmadev-admin-1.4.0.apk',
    );
  });

  it('drops anything else', () => {
    expect(safeApkUrl(null)).toBeNull();
    expect(safeApkUrl('')).toBeNull();
    expect(safeApkUrl('http://www.tekmadev.com/app.apk')).toBeNull();
    expect(safeApkUrl('javascript:alert(1)')).toBeNull();
    expect(safeApkUrl('https://')).toBeNull();
  });
});
