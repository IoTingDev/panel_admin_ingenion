export function pageHead(title: string, description: string) {
  return { meta: [
    { title: `${title} | IoTing Dev` }, { name: 'description', content: description },
    { property: 'og:title', content: `${title} | IoTing Dev` },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] };
}