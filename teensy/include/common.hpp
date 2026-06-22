#ifndef COMMON_CODE_H
#define COMMON_CODE_H

#include <utility.h>

enum class ReaderType : int8_t { None, Wiegand, Osdp };

enum class ReaderId : int8_t { reader1 = 0, reader2 = 1, invalid };

/**
 * Translates reader enums to constant text markers.
 * Returns a raw const char* to bypass heavy heap-allocated Arduino String copies.
 */
inline const char* getReaderTypeString(ReaderType readertype) {
    switch (readertype) {
    case ReaderType::None:
        return "No Reader";
    case ReaderType::Wiegand:
        return "wiegand";
    case ReaderType::Osdp:
        return "osdp";
    default:
        return "Invalid Reader Type";
    }
}

/**
 * Maps Reader ID tags to direct index array boundaries safely.
 * Returns -1 if an invalid enum parameter is passed, protecting against out-of-bounds arrays.
 */
inline int getReaderIndex(ReaderId reader) {
    if (reader == ReaderId::invalid)
        return -1;
    return static_cast<int>(reader);
}

/**
 * Maps raw integers to verified system enum tokens.
 */
inline ReaderId getReaderEnum(uint32_t reader) {
    if (reader > 1)
        return ReaderId::invalid;
    return static_cast<ReaderId>(reader);
}

/**
 * Translates incoming raw CLI command string descriptors into distinct Enum tokens.
 */
inline ReaderType getReaderEnumFromString(const String& readerMode) {
    if (readerMode == "wiegand")
        return ReaderType::Wiegand;
    if (readerMode == "osdp")
        return ReaderType::Osdp;
    return ReaderType::None;
}

#endif // COMMON_CODE_H
