(function (global) {
  var carouselState = { index: 0, slides: [], packageData: null };
  var sectionsRootReady = false;
  var VALID_SECTION_IDS = ['description', 'requirements', 'compatibility', 'video', 'reviews'];
  var DEFAULT_SECTION_ORDER = ['description', 'requirements', 'compatibility', 'video', 'reviews'];

  function getScriptData(id, fallback) {
    var el = document.getElementById(id);
    if (!el || !el.textContent) return fallback;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nl2br(text) {
    return escapeHtml(text).replace(/\r?\n/g, '<br>');
  }

  function getProductInfo(packageData) {
    var info = (packageData && packageData.product_info) || {};
    if (typeof info !== 'object') info = {};
    return {
      youtube_url: info.youtube_url || '',
      youtube_embed: info.youtube_embed || null,
      youtube_aspect_ratio: info.youtube_aspect_ratio || '1:1',
      youtube_placement: String(info.youtube_placement || 'separate').trim(),
      requirements: info.requirements || '',
      compatibility: info.compatibility || '',
      section_order: Array.isArray(info.section_order) ? info.section_order : null,
    };
  }

  function normalizeImages(packageData) {
    var list = [];
    var seen = {};
    var push = function (url) {
      var value = String(url || '').trim();
      if (!value || seen[value]) return;
      seen[value] = true;
      list.push(value);
    };

    if (packageData && Array.isArray(packageData.images) && packageData.images.length > 0) {
      packageData.images.forEach(push);
    } else if (packageData && packageData.image) {
      push(packageData.image);
    }

    return list;
  }

  function youtubeEmbedFromUrl(url) {
    var raw = String(url || '').trim();
    if (!raw) return null;
    try {
      var parsed = new URL(raw);
      var host = parsed.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') {
        var shortId = parsed.pathname.replace(/^\//, '').split('/')[0];
        return shortId ? 'https://www.youtube.com/embed/' + shortId + '?rel=0' : null;
      }
      if (host.indexOf('youtube.com') >= 0) {
        if (parsed.pathname.indexOf('/embed/') === 0) {
          var embedId = parsed.pathname.replace('/embed/', '').split('/')[0];
          return embedId ? 'https://www.youtube.com/embed/' + embedId + '?rel=0' : null;
        }
        if (parsed.pathname.indexOf('/shorts/') === 0) {
          var shortsId = parsed.pathname.replace('/shorts/', '').split('/')[0];
          return shortsId ? 'https://www.youtube.com/embed/' + shortsId + '?rel=0' : null;
        }
        var videoId = parsed.searchParams.get('v');
        return videoId ? 'https://www.youtube.com/embed/' + videoId + '?rel=0' : null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function resolveYoutubeEmbed(info) {
    if (!info) return null;
    if (info.youtube_embed) return String(info.youtube_embed);
    if (info.youtube_url) return youtubeEmbedFromUrl(info.youtube_url);
    return null;
  }

  function aspectClass(ratio) {
    var map = {
      free: 'package-video-embed--free',
      '1:1': 'package-video-embed--1-1',
      '4:3': 'package-video-embed--4-3',
      '16:9': 'package-video-embed--16-9',
      '21:9': 'package-video-embed--21-9',
    };
    return map[ratio] || map['1:1'];
  }

  function isGalleryFirst(info) {
    return String((info && info.youtube_placement) || 'separate').trim() === 'gallery_first';
  }

  function isSeparateVideo(info) {
    return !isGalleryFirst(info) && Boolean(resolveYoutubeEmbed(info));
  }

  function buildSlides(packageData) {
    var info = getProductInfo(packageData);
    var embed = resolveYoutubeEmbed(info);
    var slides = [];

    if (embed && isGalleryFirst(info)) {
      slides.push({
        type: 'video',
        embed: embed,
        aspect: info.youtube_aspect_ratio || '1:1',
      });
    }

    normalizeImages(packageData).forEach(function (url) {
      slides.push({ type: 'image', url: url });
    });

    return slides;
  }

  function ensureCarouselVideoMount(carousel) {
    var existing = document.getElementById('package-carousel-video');
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'package-carousel-video';
    wrap.setAttribute('aria-hidden', 'true');
    carousel.appendChild(wrap);
    return wrap;
  }

  function setNavVisible(btn, visible) {
    if (!btn) return;
    btn.classList.toggle('hidden', !visible);
    btn.classList.toggle('is-nav-visible', visible);
    btn.style.display = visible ? 'inline-flex' : 'none';
  }

  function renderCarouselVideoSlide(wrap, slide) {
    var aspect = slide.aspect || '1:1';
    wrap.innerHTML =
      '<div class="package-video-embed ' +
      aspectClass(aspect) +
      '"><iframe src="' +
      escapeHtml(slide.embed) +
      '" title="Vídeo do produto" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>';
  }

  function showImageSlide(imgEl, videoWrap, url, packageData) {
    if (videoWrap) {
      videoWrap.classList.remove('is-active');
      videoWrap.setAttribute('aria-hidden', 'true');
      videoWrap.innerHTML = '';
    }
    imgEl.classList.remove('hidden');
    imgEl.style.opacity = '1';
    imgEl.style.visibility = 'visible';
    imgEl.style.pointerEvents = 'auto';
    if (url) imgEl.src = url;
    imgEl.alt = (packageData && packageData.name) || 'Produto';
  }

  function showVideoSlide(imgEl, videoWrap, slide) {
    if (!videoWrap) return;
    imgEl.style.opacity = '0';
    imgEl.style.visibility = 'hidden';
    imgEl.style.pointerEvents = 'none';
    imgEl.classList.remove('hidden');
    renderCarouselVideoSlide(videoWrap, slide);
    videoWrap.classList.add('is-active');
    videoWrap.setAttribute('aria-hidden', 'false');
  }

  function setupImageCarousel(packageData) {
    var carousel = document.getElementById('package-image-carousel');
    var imgEl = document.getElementById('package-image');
    var prevBtn = document.getElementById('package-image-prev');
    var nextBtn = document.getElementById('package-image-next');
    var counter = document.getElementById('package-image-counter');
    if (!carousel || !imgEl || !prevBtn || !nextBtn) return;

    ensureCarouselVideoMount(carousel);
    var videoWrap = document.getElementById('package-carousel-video');

    carouselState.packageData = packageData;
    carouselState.slides = buildSlides(packageData);
    var slides = carouselState.slides;
    var hasMultiple = slides.length > 1;

    carousel.classList.toggle('has-slides', hasMultiple);
    setNavVisible(prevBtn, hasMultiple);
    setNavVisible(nextBtn, hasMultiple);
    if (counter) {
      counter.classList.toggle('hidden', !hasMultiple);
      counter.style.display = hasMultiple ? '' : 'none';
    }

    if (slides.length === 0) {
      if (videoWrap) {
        videoWrap.classList.remove('is-active');
        videoWrap.setAttribute('aria-hidden', 'true');
        videoWrap.innerHTML = '';
      }
      imgEl.classList.remove('hidden');
      imgEl.style.opacity = '1';
      imgEl.style.visibility = 'visible';
      if (packageData && packageData.image) imgEl.src = packageData.image;
      return;
    }

    function showAt(index) {
      carouselState.index = (index + slides.length) % slides.length;
      var slide = slides[carouselState.index];
      if (slide.type === 'video') {
        showVideoSlide(imgEl, videoWrap, slide);
      } else if (slide.type === 'image') {
        showImageSlide(imgEl, videoWrap, slide.url, packageData);
      }
      if (counter) counter.textContent = carouselState.index + 1 + ' / ' + slides.length;
    }

    prevBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      showAt(carouselState.index - 1);
    };
    nextBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      showAt(carouselState.index + 1);
    };

    showAt(0);
  }

  function infoBlockHtml(title, iconClass, bodyHtml, extraClass) {
    return (
      '<h4 class="package-info-block__title">' +
      '<i class="ph ' +
      iconClass +
      ' text-primary shrink-0" aria-hidden="true"></i>' +
      escapeHtml(title) +
      '</h4>' +
      '<div class="package-info-block__body' +
      (extraClass ? ' ' + extraClass : '') +
      '">' +
      bodyHtml +
      '</div>'
    );
  }

  function setSectionVisible(el, visible) {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.style.display = visible ? '' : 'none';
  }

  function ensureDynamicSection(key) {
    var id = 'package-section-' + key;
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('article');
    el.id = id;
    el.className = 'package-info-block hidden';
    el.setAttribute('data-package-section', key);
    el.style.display = 'none';
    return el;
  }

  function initSectionsRoot() {
    if (sectionsRootReady) return document.getElementById('package-sections-root');

    var root = document.getElementById('package-sections-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'package-sections-root';
      root.className = 'package-sections-root space-y-4 mt-4';
      var anchor =
        document.getElementById('package-product-info') ||
        document.getElementById('package-description-panel') ||
        document.getElementById('product-reviews-section');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(root, anchor);
    }

    ['requirements', 'compatibility', 'video'].forEach(function (key) {
      var el = ensureDynamicSection(key);
      if (el.parentNode !== root) root.appendChild(el);
    });

    ['package-description-panel', 'product-reviews-section'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode !== root) root.appendChild(el);
    });

    var legacy = document.getElementById('package-product-info');
    if (legacy) {
      legacy.classList.add('hidden');
      legacy.innerHTML = '';
      legacy.style.display = 'none';
    }

    sectionsRootReady = true;
    return root;
  }

  function resolveSectionOrder(info) {
    var raw = info && info.section_order;
    var order = [];
    var seen = {};

    if (Array.isArray(raw) && raw.length > 0) {
      raw.forEach(function (id) {
        var value = String(id || '').trim();
        if (VALID_SECTION_IDS.indexOf(value) < 0 || seen[value]) return;
        if (value === 'video' && isGalleryFirst(info)) return;
        seen[value] = true;
        order.push(value);
      });
    }

    if (order.length === 0) {
      return DEFAULT_SECTION_ORDER.filter(function (id) {
        if (id === 'video') return isSeparateVideo(info);
        return true;
      });
    }

    return order;
  }

  function sectionAllowed(id, info) {
    if (id === 'video') return isSeparateVideo(info);
    return VALID_SECTION_IDS.indexOf(id) >= 0;
  }

  function hasDescription(packageData) {
    var html = String((packageData && packageData.description) || '').trim();
    if (html) return true;
    var descEl = document.getElementById('package-description');
    return Boolean(descEl && String(descEl.innerHTML || '').trim());
  }

  function sectionShouldShow(id, info, packageData) {
    if (id === 'description') return hasDescription(packageData);
    if (id === 'requirements') return Boolean(String(info.requirements || '').trim());
    if (id === 'compatibility') return Boolean(String(info.compatibility || '').trim());
    if (id === 'video') return isSeparateVideo(info);
    if (id === 'reviews') return Boolean(document.getElementById('product-reviews-section'));
    return false;
  }

  function updateDescriptionPanel(packageData) {
    var descEl = document.getElementById('package-description');
    if (!descEl) return;
    if (packageData && packageData.description) {
      descEl.innerHTML = packageData.description;
    }
  }

  function updateRequirementsSection(info) {
    var el = document.getElementById('package-section-requirements');
    if (!el) return;
    var text = String(info.requirements || '').trim();
    el.innerHTML = text ? infoBlockHtml('Requisitos', 'ph-list-checks', nl2br(text)) : '';
  }

  function updateCompatibilitySection(info) {
    var el = document.getElementById('package-section-compatibility');
    if (!el) return;
    var text = String(info.compatibility || '').trim();
    el.innerHTML = text ? infoBlockHtml('Compatibilidade', 'ph-devices', nl2br(text)) : '';
  }

  function updateVideoSection(info) {
    var el = document.getElementById('package-section-video');
    if (!el) return;
    if (!isSeparateVideo(info)) {
      el.innerHTML = '';
      setSectionVisible(el, false);
      return;
    }
    var aspect = info.youtube_aspect_ratio || '1:1';
    var embed = resolveYoutubeEmbed(info);
    el.innerHTML = infoBlockHtml(
      'Vídeo',
      'ph-play-circle',
      '<div class="package-video-embed ' +
        aspectClass(aspect) +
        '"><iframe src="' +
        escapeHtml(embed) +
        '" title="Vídeo do produto" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>'
    );
  }

  function renderOrderedSections(packageData) {
    var root = initSectionsRoot();
    if (!root) return;

    var info = getProductInfo(packageData);
    var order = resolveSectionOrder(info);

    updateDescriptionPanel(packageData);
    updateRequirementsSection(info);
    updateCompatibilitySection(info);
    updateVideoSection(info);

    var sectionMap = {
      description: document.getElementById('package-description-panel'),
      requirements: document.getElementById('package-section-requirements'),
      compatibility: document.getElementById('package-section-compatibility'),
      video: document.getElementById('package-section-video'),
      reviews: document.getElementById('product-reviews-section'),
    };

    var visibleNodes = [];
    order.forEach(function (id) {
      if (!sectionAllowed(id, info)) return;
      var el = sectionMap[id];
      if (!el) return;
      var show = sectionShouldShow(id, info, packageData);
      setSectionVisible(el, show);
      if (show) visibleNodes.push(el);
    });

    Object.keys(sectionMap).forEach(function (key) {
      if (visibleNodes.indexOf(sectionMap[key]) < 0) {
        setSectionVisible(sectionMap[key], false);
      }
    });

    visibleNodes.forEach(function (node) {
      root.appendChild(node);
    });
  }

  function renderProductInfo(packageData) {
    setupImageCarousel(packageData);
    renderOrderedSections(packageData);
  }

  function bootstrapFromPage() {
    if (!document.querySelector('.package-wrapper')) return;
    var initial = getScriptData('__nerix_package_initial', null);
    if (initial) renderProductInfo(initial);
  }

  global.NerixProductInfo = {
    render: renderProductInfo,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapFromPage);
    } else {
      bootstrapFromPage();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
