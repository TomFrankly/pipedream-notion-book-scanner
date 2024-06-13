// Import Axios, which is used to make HTTP requests to APIs (in this case, Google Books and Open Library): https://axios-http.com/docs/intro
import axios from "axios";

// Import async-retry, which is used to retry requests if they fail: https://github.com/vercel/async-retry
import retry from "async-retry";

export default defineComponent({
  props: {
    google_books_key: {
      type: "string",
      label: "Google Books API Key",
      description: `If you'd like to use the Google Books API to fetch book data, either enter your Google Books API key here or store is as an environment variable with the name GOOGLE_BOOKS.
      
      You can get a Google Books API key by following the instructions here: https://developers.google.com/books/docs/v1/using#APIKey.
      
      If you don't enter a key here or store on as an environment variable named GOOGLE_BOOKS, this step will only use the Open Library API to fetch book data.`,
      optional: true,
      secret: true,
    },
  },
  methods: {
    /**
     * Fetches the book data from the given URL. This is a generic method that can make requests to multiple APIs.
     *
     * In this case, we'll use it to fetch data from both Google Books and Open Library.
     *
     * Uses async-retry to retry the request up to 3 times if it fails.
     */
    async fetchBookData(url) {
      return await retry(
        async (bail, attempt) => {
          try {
            console.log(`Fetching data from URL: ${url} (Attempt ${attempt})`);
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
        }
      );
    },
    /**
     * Gets the highest-resolution cover image available from Open Library, given the book's ISBN.
     */
    async fetchBookCover(isbn) {
      // Get the highest-resolution cover from Open Library that we can
      console.log(`Attempting to fetch the cover image.`);
      const sizes = ["L", "M", "S"];

      const baseCoverURL = `https://covers.openlibrary.org/b/isbn/${isbn}`;

      // For each size, starting from the largest size, see if the cover exists.
      for (let size of sizes) {
        console.log(`Checking cover size: ${size}`);

        // When we add "?default=false" to the URL, cover images that don't exist will return a 404.
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
    /**
     * Builds the book title, appending the subtitle to the original title if it exists.
     */
    buildBookTitle(book) {
      console.log(`Building the book title.`);
      let title = book.title;

      if (book.subtitle && book.subtitle !== "") {
        title += `: ${book.subtitle}`;
      }

      return title;
    },
    /**
     * Constructs the final book record, removing any empty fields.
     */
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
    try {
      // Set a variable for the Google Books API key. If it ends up null, we'll use the Open Library API instead.
      let googleBooksAPIKey =
        process.env.GOOGLE_BOOKS && process.env.GOOGLE_BOOKS !== ""
          ? process.env.GOOGLE_BOOKS
          : this.google_books_key && this.google_books_key !== ""
          ? this.google_books_key
          : null;

      // Set up variables for the ISBN number and the initial book object
      const isbn = parseInt(steps.trigger.event.body.isbn.replace(/-/g, ""));

      const book = {
        db: "",
        db_id: "",
        status: "",
        title: "",
        author: "",
        cover_image: "",
        isbn_13: isbn,
        publish_year: "",
        page_count: "",
        full_record: "",
      };

      // Set up Google Books search variables in a high enough scope to use later
      let searchURL = null;
      let searchResponse = null;

      // Search for the book in the Google Books API, if the key is set. If not, skip directly to searching Open Library.
      if (googleBooksAPIKey) {
        console.log(`Searching Google Books for book with ISBN: ${isbn}`);
        const searchURL = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${googleBooksAPIKey}`;
        const searchResponse = await this.fetchBookData(searchURL);

        console.log(`Search response from Google Books:`);
        console.dir(searchResponse);
      } else {
        console.log(
          `Google Books API key not set. Only searching Open Library.`
        );
      }

      // Create an Open Library variable in a high enough scope, in case we need to use it later
      let openLibraryBook = null;

      // If the search was successful, store the book ID. Otherwise, use our fallback method to do it.
      if (
        searchResponse &&
        searchResponse.items &&
        searchResponse.items.length > 0
      ) {
        book.db = "google_books";
        book.db_id = searchResponse.items[0].id;
        book.status = "Exact match";
        console.log(`Found book in Google Books with ID: ${book.db_id}`);
      } else {
        console.log(
          `No book found in Google Books, or API key not set. Using Open Library method.`
        );

        // Search for the book in the Open Library API
        const openLibraryURL = `https://openlibrary.org/search.json?q=${isbn}`;
        const openLibraryResponse = await this.fetchBookData(openLibraryURL);

        console.log(`Search response from Open Library:`);
        console.dir(openLibraryResponse);

        // If the search was successful, get the book's other ISBN numbers and search Google Books for a valid match.
        if (openLibraryResponse.docs && openLibraryResponse.docs.length > 0) {
          console.log(`Found book in Open Library.`);
          if (googleBooksAPIKey) {
            console.log(
              `Searching Google Books for a match using other ISBN numbers for this title.`
            );
          }

          // Store the Open Library entry data in case we need to fall back on it
          openLibraryBook = openLibraryResponse.docs[0];
          // Get only the ISBN-13 numbers
          const ISBNArray = openLibraryResponse.docs[0].isbn.filter(
            (edition) => edition.length === 13
          );

          // If Google Books API is set, search Google Books for the book returned by Open Library
          if (googleBooksAPIKey) {
            // Loop through the ISBN-13 array, searching Google Books until we find a valid record.
            for (let number of ISBNArray) {
              console.log(`Searching Google Books for ISBN: ${number}`);
              const searchURL = `https://www.googleapis.com/books/v1/volumes?q=isbn:${number}&key=${googleBooksAPIKey}`;
              const searchResponse = await this.fetchBookData(searchURL);

              if (searchResponse.items && searchResponse.items.length > 0) {
                console.log(`Found a valid match in Google Books.`);
                book.db = "google_books";
                book.db_id = searchResponse.items[0].id;
                book.status = "Nearest match";
                break;
              }

              console.log(`No match found in Google Books.`);
              book.db = "open_library";
              book.db_id = openLibraryBook.key;
            }
          } else {
            // If Google Books API is not set, use the Open Library record.
            console.log(`Setting Open Library as the book database.`);
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
          book.author = fullRecordResponse.volumeInfo.authors?.join(", ") ?? "";
          book.page_count = fullRecordResponse.volumeInfo.pageCount ?? "";
          book.publish_year =
            parseInt(
              fullRecordResponse.volumeInfo.publishedDate.substring(0, 4)
            ) ?? ""; // Get only the year
          book.full_record = fullRecordResponse.volumeInfo;
        } else if (book.db === "open_library" && openLibraryBook) {
          // We didn't find a valid Google Books match, so we'll use the Open Library record.
          console.log(
            `No valid Google Books match found. Using Open Library record.`
          );

          book.title = this.buildBookTitle(openLibraryBook);
          book.author = openLibraryBook.author_name?.join(", ") ?? "";
          book.page_count = openLibraryBook.number_of_pages_median ?? "";
          book.publish_year =
            parseInt(openLibraryBook.first_publish_year) ?? "";
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
