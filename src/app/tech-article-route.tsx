import type { Metadata } from 'next';
import TechArticleRoute, {
  generateMetadata as generateTechArticleMetadata
} from '@/app/[lang]/[section]/[slug]/page';
import { getTechArticleOwnerParams } from '@/lib/tech-center-content';

type RootTechArticleParams = { slug: string };

function getLocalizedParams(params: Promise<RootTechArticleParams>, section: string) {
  return params.then(({ slug }) => ({ lang: 'zh', section, slug }));
}

export function createRootTechArticleRoute(section: string) {
  return {
    Page({ params }: { params: Promise<RootTechArticleParams> }) {
      return TechArticleRoute({ params: getLocalizedParams(params, section) });
    },
    generateMetadata({ params }: { params: Promise<RootTechArticleParams> }): Promise<Metadata> {
      return generateTechArticleMetadata({ params: getLocalizedParams(params, section) });
    },
    generateStaticParams() {
      return getTechArticleOwnerParams(section);
    }
  };
}
