import * as WebBrowser from 'expo-web-browser';
import { Linking, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { useTheme } from '@/design/theme';
import { notice } from '@/lib/notice';

import { isPreviewDocument, previewLinkTarget } from '../logic';

/** Never more than one Custom Tab per tap, even if the page fires twice. */
let lastOpen = { url: '', at: 0 };

function openOutside(url: string, toolbar: string) {
  const target = previewLinkTarget(url);
  if (!target) return;
  const now = Date.now();
  if (lastOpen.url === target && now - lastOpen.at < 800) return;
  lastOpen = { url: target, at: now };
  if (target.toLowerCase().startsWith('mailto:')) {
    Linking.openURL(target).catch(() => notice.err('Could not open that link.'));
    return;
  }
  WebBrowser.openBrowserAsync(target, { toolbarColor: toolbar, secondaryToolbarColor: toolbar, showTitle: true, enableBarCollapsing: true }).catch(
    () => notice.err('Could not open that link.'),
  );
}

export type TemplatePreviewProps = {
  /** The template's `previewHtml` (sample values, no tracking pixel). */
  html: string;
  name: string;
};

/**
 * The template rendered as a mail client would (brief 8.11): a WebView with
 * JavaScript, storage and file access off that loads only the HTML string
 * (about:blank). It never navigates: a tapped link opens its destination in a
 * Custom Tab (Safari view on iOS) instead.
 *
 * The origin whitelist is enforced in onShouldStartLoadWithRequest rather than
 * `originWhitelist`: with only about:blank listed, the library itself would
 * hand every tapped link to Linking.openURL (the external browser, any scheme)
 * before our handler runs.
 */
export function TemplatePreview({ html, name }: TemplatePreviewProps) {
  const { colors } = useTheme();

  const onShouldStart = (request: ShouldStartLoadRequest) => {
    if (isPreviewDocument(request.url)) return true;
    if (request.isTopFrame) openOutside(request.url, colors.bg);
    return false;
  };

  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={onShouldStart}
      onOpenWindow={(e) => openOutside(e.nativeEvent.targetUrl, colors.bg)}
      setSupportMultipleWindows={false}
      javaScriptEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      mixedContentMode="never"
      incognito
      textZoom={100}
      dataDetectorTypes="none"
      style={[styles.web, { backgroundColor: colors.bg2 }]}
      containerStyle={styles.container}
      accessibilityLabel={`Preview of ${name}`}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  web: { flex: 1 },
});
