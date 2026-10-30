"Slip kernel: Character. Characters are unique: two characters of one value are identical."!

!Character class methodsFor: 'instance creation'!
value: anInteger
	<primitive: 'charFromValue'>
	^self error: anInteger printString, ' is not a character value'
!
codePoint: anInteger
	^self value: anInteger
!
digitValue: anInteger
	^'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' at: anInteger + 1
!
new
	^self error: 'Characters are made with Character value: or $c'
! !

!Character class methodsFor: 'constants'!
cr
	^self value: 13
!
lf
	^self value: 10
!
tab
	^self value: 9
!
space
	^self value: 32
!
null
	^self value: 0
!
escape
	^self value: 27
! !

!Character methodsFor: 'accessing'!
value
	<primitive: 'charValue'>
	^0
!
asInteger
	^self value
!
codePoint
	^self value
!
asCharacter
	^self
!
digitValue
	| v |
	v := self asUppercase value.
	(v between: 48 and: 57) ifTrue: [^v - 48].
	(v between: 65 and: 90) ifTrue: [^v - 55].
	^-1
! !

!Character methodsFor: 'testing'!
isCharacter
	^true
!
isLiteral
	^true
!
is: aSymbol
	<primitive: 'charTest'>
	^false
!
isLetter
	^self is: #letter
!
isDigit
	^self is: #digit
!
isVowel
	^self is: #vowel
!
isUppercase
	^self is: #uppercase
!
isLowercase
	^self is: #lowercase
!
isSeparator
	^self is: #separator
!
isAlphaNumeric
	^self is: #alphanumeric
!
isPunctuation
	^self is: #punctuation
! !

!Character methodsFor: 'converting'!
asUppercase
	<primitive: 'charUpper'>
	^self
!
asLowercase
	<primitive: 'charLower'>
	^self
!
asString
	^String with: self
!
asSymbol
	^(String with: self) asSymbol
! !

!Character methodsFor: 'comparing'!
< aCharacter
	^self value < aCharacter value
!
hash
	^self value
! !

!Character methodsFor: 'copying'!
shallowCopy
	^self
! !

!Character methodsFor: 'printing'!
printOn: aStream
	aStream nextPut: $$; nextPut: self
!
displayString
	^String with: self
! !
