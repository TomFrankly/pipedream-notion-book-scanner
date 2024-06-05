import axios from "axios";
import retry from "async-retry";

export default defineComponent({
  methods: {
    async fetchBookData(url) {
      return await retry(
        async (bail) => {
          try {
            const response = await axios.get(url);
            if (response.status === 200) {
              return response.data;
            } else {
              throw new Error(`Status code: ${response.status}`);
            }
          } catch (error) {
            if (
              error.response &&
              error.response.status >= 400 &&
              error.response.status < 500
            ) {
              bail(
                new Error(
                  `Cannot retry due to error: ${error.message} (Status code: ${error.response.status})`
                )
              );
            } else {
              console.error(
                `Retrying due to error: ${error.message} (Status code: ${error.response.status})`
              );
            }
          }
        },
        {
          retries: 3,
          minTimeout: 2000,
          onRetry: (error, attempt) => {
            console.error(`Attempt ${attempt} failed: ${error.message}`);
          },
        }
      );
    },
    async fetchBookCover(isbn) {
      // Get the highest-resolution cover from Open Library that we can
      console.log(`Attempting to fetch the cover image.`);
      const sizes = ["L", "M", "S"];

      const baseCoverURL = `https://covers.openlibrary.org/b/isbn/${isbn}`;

      // For each size, starting from the largest size, see if the cover exists.
      for (let size of sizes) {
        console.log(`Checking cover size: ${size}`);
        const coverURL = `${baseCoverURL}-${size}.jpg?default=false`;

        try {
          const response = await axios.get(coverURL, {
            validateStatus: (status) => status === 200 && status !== 404,
          });

          if (response.status === 200) {
            console.log(`Cover found for size: ${size}`);
            return coverURL.replace(/\?default=false$/, "");
          }
        } catch (error) {
          if (error.response.status === 404) {
            console.log(`Cover not found for size: ${size}`);
          } else {
            console.error(`Encountered error fetching cover: ${error.message}`);
          }
        }
      }
    },
    buildBookTitle(book) {
      console.log(`Building the book title.`);
      let title = book.title;

      if (book.subtitle && book.subtitle !== "") {
        title += `: ${book.subtitle}`;
      }

      return title;
    },
    constructBookRecord(book) {
      // Remove empty fields from the book record
      const finalBookRecord = Object.keys(book).reduce((acc, key) => {
        if (book[key] !== "") {
          acc[key] = book[key];
        }

        return acc;
      }, {});

      console.log(`Final book record with blank fields removed:`);
      console.dir(finalBookRecord);

      return finalBookRecord;
    },
  },
  async run({ steps, $ }) {
    const googleBooksAPIKey = process.env.GOOGLE_BOOKS;
    const isbn = steps.trigger.event.body.isbn;

    const book = {
      db: "",
      db_id: "",
      status: "",
      title: "",
      author: "",
      cover_image: "",
      isbn_13: isbn,
      publish_date: "",
      page_count: "",
      full_record: "",
    };

    // Try fetching the book from the Google Books API
    try {
      console.log(`Searching Google Books for book with ISBN: ${isbn}`);
      const searchURL = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${googleBooksAPIKey}`;
      const searchResponse = await this.fetchBookData(searchURL);

      console.log(`Search response from Google Books:`);
      console.dir(searchResponse);

      // If the search was successful, store the book ID. Otherwise, use our fallback method to do it.
      if (searchResponse.items && searchResponse.items.length > 0) {
        book.db = "google_books";
        book.db_id = searchResponse.items[0].id;
        book.status = "Exact match";
        console.log(`Found book in Google Books with ID: ${book.db_id}`);
      } else {
        console.log(`No book found in Google Books. Using fallback method.`);

        // Search for the book in the Open Library API
        const openLibraryURL = `https://openlibrary.org/search.json?q=${isbn}`;
        const openLibraryResponse = await this.fetchBookData(openLibraryURL);

        console.log(`Search response from Open Library:`);
        console.dir(openLibraryResponse);

        // If the search was successful, get the book's other ISBN numbers and search Google Books for a valid match.
        if (openLibraryResponse.docs && openLibraryResponse.docs.length > 0) {
          console.log(
            `Found book in Open Library. Searching Google Books for a match using other ISBN numbers for this title.`
          );
          // Store the Open Library entry data in case we need to fall back on it
          const openLibraryBook = openLibraryResponse.docs[0];
          // Get only the ISBN-13 numbers
          const ISBNArray = openLibraryResponse.docs[0].isbn.filter(
            (edition) => edition.length === 13
          );

          // Loop through the ISBN-13 array, searching Google Books until we find a valid record.
          for (let number of ISBNArray) {
            console.log(`Searching Google Books for ISBN: ${number}`);
            const searchURL = `https://www.googleapis.com/books/v1/volumes?q=isbn:${number}&key=${googleBooksAPIKey}`;
            const searchResponse = await this.fetchBookData(searchURL);

            if (searchResponse.items && searchResponse.items.length > 0) {
              console.log(`Found a valid match in Google Books.`);
              book.db = "google_books";
              book.db_id = searchResponse.items[0].id;
              book.status = "Nearest match"
              break;
            }

            console.log(`No match found in Google Books.`);
            book.db = "open_library";
            book.db_id = openLibraryBook.key;
          }
        } else {
          // Search wasn't successful in either book database. Return a generic record with the ISBN number alone.
          console.log(
            `No book found in Open Library. Returning generic record.`
          );
          book.title = `Unidentified Book with ISBN: ${isbn}`;
          book.isbn_13 = isbn;
        }
      }

      if (book.db !== "") {
        // If we found a valid Google Books match, query Google Books with the book ID to get the full record.
        if (book.db === "google_books") {
          console.log(`Fetching full book record from Google Books.`);
          const fullRecordURL = `https://www.googleapis.com/books/v1/volumes/${book.db_id}?key=${googleBooksAPIKey}`;
          const fullRecordResponse = await this.fetchBookData(fullRecordURL);

          console.log(`Full record response from Google Books:`);
          console.dir(fullRecordResponse);

          // Add the info to the book object
          book.title = this.buildBookTitle(fullRecordResponse.volumeInfo);
          book.author = fullRecordResponse.volumeInfo.authors.join(", ");
          book.page_count = fullRecordResponse.volumeInfo.pageCount ?? "";
          book.publish_date =
            fullRecordResponse.volumeInfo.publishedDate.substring(0, 4) ?? ""; // Get only the year
          book.full_record = fullRecordResponse.volumeInfo;
        } else if (book.db === "open_library") {
          // We didn't find a valid Google Books match, so we'll use the Open Library record.
          console.log(
            `No valid Google Books match found. Using Open Library record.`
          );

          book.title = this.buildBookTitle(openLibraryBook);
          book.author = openLibraryBook.author_name.join(", ");
          book.page_count = openLibraryBook.number_of_pages_median ?? "";
          book.publish_date = openLibraryBook.first_publish_year ?? "";
          book.status = "Exact match";
          book.full_record = openLibraryBook;
        }

        // Try to get the cover image from Open Library
        book.cover_image = await this.fetchBookCover(book.isbn_13);
      }

      // Construct and return the final book record
      return this.constructBookRecord(book);
    } catch (error) {
      throw new Error(`Error fetching book data: ${error.message}`);
    }
  },
});
