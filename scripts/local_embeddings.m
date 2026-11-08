// Uses the already-installed Apple English sentence model. Never downloads assets.
#import <Foundation/Foundation.h>
#import <NaturalLanguage/NaturalLanguage.h>
int main() { @autoreleasepool {
    NSData *input = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    if (input.length > 30000) return 2;
    NSString *text = [[NSString alloc] initWithData:input encoding:NSUTF8StringEncoding];
    NLEmbedding *model = [NLEmbedding sentenceEmbeddingForLanguage:NLLanguageEnglish revision:1];
    if (!model || model.dimension != 512 || !text.length) return 3;
    NSArray *vector = [model vectorForString:text];
    if (vector.count != 512) return 4;
    NSData *result = [NSJSONSerialization dataWithJSONObject:vector options:0 error:nil];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:result];
} return 0; }
