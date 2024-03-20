#include "runtime.h"

/*****************************************************************************/
/* Obstack. */
/*****************************************************************************/

// The obstack is structured as a linked list of pages. The size of the page is
// determined by PAGE_SIZE. If an Obstack_alloc attempts to allocate something
// larger than an obstack page, then the size of the page will the exactly
// the size of the allocation (plus meta-data). Every time a page runs out of
// space, we allocate a new page, and we maintain a pointer to the old page.

/* The linked list of pages used by the obstack.

     ------------
    | PAGE 1     |
    |------------|
  ->| NULL       |
  | | SIZE       |
  | |------------|
  | | USER DATA  |
  | | ...        |
  |  ------------
  |
  |  -------------
  | | PAGE 2      |
  | |-------------|
  --| ADDR PAGE 1 |
    | SIZE        |
    |-------------|
    | USER DATA   |
    | ...         |
     -------------
*/

// page: The beginning of the current obstack page
// head: The current position in the page.
// end: The end of the page.

#ifdef SKIP32


// In 32bits mode there are no threads, so the obstack does not have to be
// thread local. This is because wasm doesn't support threads (at least not
// well).

struct sk_obstack* page = NULL;
char* head = NULL;
char* end = NULL;

#else

__thread struct sk_obstack* page = NULL;
__thread char* head = NULL;
__thread char* end = NULL;

#endif

/*****************************************************************************/
/* Obstack allocation. */
/*****************************************************************************/

typedef struct {
  char* head;
  struct sk_obstack* page;
  char* end;
} sk_saved_obstack_t;

typedef struct sk_obstack {
  struct sk_obstack* previous;
  size_t size;
  sk_saved_obstack_t saved;
  char user_data[0];
} sk_obstack_t;
#ifdef SKIP32
sk_saved_obstack_t init_saved = {NULL, NULL, NULL};
#else
__thread sk_saved_obstack_t init_saved = {NULL, NULL, NULL};
#endif


size_t sk_page_size(sk_obstack_t* page) {
  return page->size;
}

int sk_is_large_page(sk_obstack_t* page) {
  return sk_page_size(page) > PAGE_SIZE;
}

void sk_obstack_attach_page(sk_obstack_t* lpage, sk_obstack_t* next) {
  if (next != NULL) {
    next->previous = lpage->previous;
  }
  lpage->previous = page->previous;
  page->previous = lpage;
}

char* sk_large_page(size_t size) {
  size_t block_size = size + sizeof(sk_obstack_t);
  // This space is needed in case the page gets interned (TO CHECK)
  block_size += 64;
  sk_obstack_t* lpage = (sk_obstack_t*)sk_malloc(block_size);
  sk_obstack_attach_page(lpage, NULL);
  lpage->size = block_size;
  sk_saved_obstack_t* saved = &lpage->saved;
  saved->head = NULL;
  saved->end = NULL;
  saved->page = NULL;
  return lpage->user_data + 64;
}

void sk_new_page() {
  size_t block_size = PAGE_SIZE;
  sk_obstack_t* previous_page = page;
#ifdef SKIP32
  page = (sk_obstack_t*)sk_malloc_end(block_size);
#endif
#ifdef SKIP64
  page = (sk_obstack_t*)sk_malloc(block_size);
#endif
  page->previous = previous_page;
  page->size = block_size;
  sk_saved_obstack_t* saved = &page->saved;
  saved->head = NULL;
  saved->end = NULL;
  saved->page = NULL;
  end = (char*)page + block_size;
  head = page->user_data;
}

char* SKIP_Obstack_alloc(size_t size) {
  char* result;
  size += 8;
  size = (size + 7) & ~7;

  if (head + size >= end) {
    if (size + sizeof(sk_obstack_t) > PAGE_SIZE) {
      result = sk_large_page(size);
      result += 8;
      return result;
    } else {
      sk_new_page();
    }
  }

  result = head;
  head += size;

  result += 8;
  return result;
}

void* SKIP_Obstack_calloc(size_t size) {
  char* result = SKIP_Obstack_alloc(size);
  memset(result, 0, size);
  return result;
}

char* SKIP_Obstack_shallowClone(size_t /* size */, char* obj) {
  SKIP_gc_type_t* ty = get_gc_type(obj);

  size_t memsize = ty->m_userByteSize;
  size_t leftsize = uninterned_metadata_byte_size(ty);
  size_t size = memsize + leftsize;

  char* mem = SKIP_Obstack_alloc(size);
  memcpy(mem, obj - leftsize, size);
  return mem + leftsize;
}

/*****************************************************************************/
/* Obstack creation/destruction. */
/*****************************************************************************/

sk_saved_obstack_t* sk_saved_obstack(sk_obstack_t* page) {
  return &page->saved;
}

sk_saved_obstack_t* SKIP_new_Obstack() {
  sk_saved_obstack_t* saved;
  if (head == NULL && page == NULL && end == NULL) {
    saved = &init_saved;
  } else {
    saved = sk_saved_obstack(page);
  }

  saved->head = head;
  saved->page = page;
  saved->end = end;

  sk_new_page();

  return saved;
}

void SKIP_destroy_Obstack(sk_saved_obstack_t* saved) {
  sk_obstack_t* saved_page;
  char* saved_head;
  char* saved_end;
  if (saved == NULL) {
    saved_page = NULL;
    saved_head = NULL;
    saved_end = NULL;
  } else {
    saved_page = saved->page;
    saved_head = saved->head;
    saved_end = saved->end;
  }
  while (!((char*)page <= saved_head && saved_head <= end)) {
    sk_obstack_t* tofree = page;
    size_t tosk_free_size = sk_page_size(page);
    page = page->previous;
    sk_free_size(tofree, tosk_free_size);
    if (page == NULL) {
      head = NULL;
      page = NULL;
      end = NULL;
      return;
    }
    size_t size = page->size;
    end = (char*)page + size;
  }
  head = saved_head;
  page = saved_page;
  end = saved_end;

  if (saved != NULL) {
    saved->page = NULL;
    saved->head = NULL;
    saved->end = NULL;
  }
}

void* SKIP_destroy_Obstack_with_value(sk_saved_obstack_t* saved, void* toCopy) {
  size_t nbr_pages = sk_get_nbr_pages(saved->page);
  sk_cell_t* pages = sk_get_pages(nbr_pages);

  page = saved->page;
  head = saved->head;
  end = saved->end;

  saved->page = NULL;
  saved->head = NULL;
  saved->end = NULL;

  void* result = SKIP_copy_with_pages(toCopy, nbr_pages, pages);

  unsigned int i;
  for (i = 0; i < nbr_pages; i++) {
    if ((uint64_t)pages[i].key != pages[i].value) {
      sk_obstack_t* fpage = (sk_obstack_t*)(pages[i].key);
      size_t fpage_size = fpage->size;
      sk_free_size(fpage, fpage_size);
    }
  }

  sk_free_size(pages, sizeof(sk_cell_t) * nbr_pages);

  return result;
}

sk_obstack_t* SKIP_switch_to_parent(sk_saved_obstack_t* saved) {
  // Gather current obstack data
  sk_obstack_t* first = page;
  while (first != NULL && first->previous != saved->page) {
    first = first->previous;
  }
  
  sk_obstack_t* saved_page = page;
  char* saved_head = head;
  char* saved_end = end;

  // Switch to parent obstack
  page = saved->page;
  head = saved->head;
  end = saved->end;

  // Store obstack dat for restauration
  saved->head = saved_head;
  saved->page = first;
  saved->end = saved_end;

  return saved_page;
}

void SKIP_restore_from_parent(sk_saved_obstack_t* saved, sk_obstack_t* leading) {
  // Save the obstack restauration data
  sk_obstack_t* first_page = saved->page;
  char* saved_head = saved->head;
  char* saved_end = saved->end;

  // Update the sub obstack with new parent obstack positions
  first_page->previous = page;
  saved->page = page;
  saved->head = head;
  saved->end = end;

  // Switch to sub obstack
  page = leading;
  head = saved_head;
  end = saved_end;
}

static int sk_gc_enabled = 1;

void SKIP_disable_GC() {
  sk_gc_enabled = 0;
}

void SKIP_enable_GC() {
  sk_gc_enabled = 1;
}

uint32_t SKIP_should_GC(sk_saved_obstack_t* saved) {
  if (!sk_gc_enabled) return 0;
  size_t nbr_page = 0;
  sk_obstack_t* cursor = page;
  while (cursor != NULL && cursor != saved->page) {
    cursor = cursor->previous;
    nbr_page++;
    if (nbr_page > 3 ||
        (nbr_page > 1 && (head - page->user_data > (2 * PAGE_SIZE / 3)))) {
      return 1;
    }
  }
  return 0;
}

/*****************************************************************************/
/* Collection primitive (disabled). */
/*****************************************************************************/

void SKIP_Obstack_auto_collect() {}

void* SKIP_Obstack_collect1(void* /* note */, void* obj) {
  return obj;
}

/*****************************************************************************/
/* Sort used to sort the pages. */
/*****************************************************************************/

static void heapify(sk_cell_t* arr, size_t n, size_t i) {
  size_t largest = i;
  size_t l = 2 * i + 1;
  size_t r = 2 * i + 2;

  if (l < n && arr[l].key > arr[largest].key) {
    largest = l;
  }

  if (r < n && arr[r].key > arr[largest].key) {
    largest = r;
  }

  if (largest != i) {
    sk_cell_t tmp = arr[i];
    arr[i] = arr[largest];
    arr[largest] = tmp;
    heapify(arr, n, largest);
  }
}

void sk_heap_sort(sk_cell_t* arr, size_t n) {
  if (n <= 1) return;

  for (int i = n / 2 - 1; i >= 0; i--) {
    heapify(arr, n, i);
  }

  for (size_t i = n - 1; i > 0; i--) {
    sk_cell_t tmp = arr[0];
    arr[0] = arr[i];
    arr[i] = tmp;
    heapify(arr, i, 0);
  }
}

/*****************************************************************************/
/* Search. */
/*****************************************************************************/

size_t sk_get_nbr_pages(sk_obstack_t* saved_page) {
  size_t nbr_page = 0;
  sk_obstack_t* cursor = page;
  while (cursor != NULL && cursor != saved_page) {
    cursor = cursor->previous;
    nbr_page++;
  }
  return nbr_page;
}

sk_cell_t* sk_get_pages(size_t nbr_pages) {
  sk_cell_t* result = (sk_cell_t*)sk_malloc(sizeof(sk_cell_t) * nbr_pages);
  unsigned int i = 0;
  sk_obstack_t* cursor = page;
  for (i = 0; i < nbr_pages; i++) {
    result[i].key = cursor;
    result[i].value = (uint64_t)cursor + cursor->size;
    cursor = cursor->previous;
  }
  sk_heap_sort(result, nbr_pages);
  return result;
}

size_t binarySearch(sk_cell_t* arr, size_t l, size_t r, char* x) {
  if (l >= r) {
    if (((char*)arr[l].key <= x && x < (char*)(arr[l].value))) {
      return l;
    } else {
      return (size_t)-1;
    }
  }

  size_t mid = l + (r - l) / 2;

  if (x < (char*)arr[mid].key) {
    if (mid <= l) {
      // this happens when r = l + 1
      return (size_t)-1;
    } else {
      return binarySearch(arr, l, mid - 1, x);
    }
  } else if (x >= (char*)(arr[mid].value)) {
    return binarySearch(arr, mid + 1, r, x);
  } else {
    return mid;
  }
}

size_t sk_get_obstack_idx(char* ptr, sk_cell_t* pages, size_t nbr_pages) {
  if (nbr_pages == 0 || pages == NULL) {
    return (size_t)-1;
  }
  size_t result = binarySearch(pages, 0, nbr_pages - 1, ptr);
  return result;
}
