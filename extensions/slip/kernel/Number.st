"Slip kernel: Number, Integer, Float and Fraction. Integers are exact at any size; a quotient
of two integers that does not divide is a Fraction; any Float makes the result a Float."!

!Number methodsFor: 'testing'!
isNumber
	^true
!
isLiteral
	^true
!
isZero
	^self = 0
!
negative
	^self < 0
!
positive
	^self >= 0
!
strictlyPositive
	^self > 0
!
even
	^self \\ 2 = 0
!
odd
	^self even not
!
isNaN
	^false
!
isInfinite
	^false
!
sign
	self > 0 ifTrue: [^1].
	self < 0 ifTrue: [^-1].
	^0
! !

!Number methodsFor: 'coercing'!
generality
	^self subclassResponsibility
!
coerce: aNumber
	^self subclassResponsibility
!
retry: aSelector coercing: aNumber
	aNumber isNumber ifFalse: [^self error: aNumber basicDescription, ' is not a number'].
	self generality = aNumber generality ifTrue: [^self error: 'Cannot ', aSelector, ' ', self printString, ' and ', aNumber printString].
	self generality < aNumber generality
		ifTrue: [^(aNumber coerce: self) perform: aSelector with: aNumber].
	^self perform: aSelector with: (self coerce: aNumber)
! !

!Number methodsFor: 'arithmetic'!
+ aNumber
	<primitive: 'add'>
	^self retry: #+ coercing: aNumber
!
- aNumber
	<primitive: 'sub'>
	^self retry: #- coercing: aNumber
!
* aNumber
	<primitive: 'mul'>
	^self retry: #* coercing: aNumber
!
/ aNumber
	<primitive: 'div'>
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	(self isInteger and: [aNumber isInteger])
		ifTrue: [^(Fraction numerator: self denominator: aNumber) normalized].
	^self retry: #/ coercing: aNumber
!
// aNumber
	<primitive: 'intDiv'>
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	^(self / aNumber) floor
!
\\ aNumber
	<primitive: 'mod'>
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	^self - (self // aNumber * aNumber)
!
quo: aNumber
	<primitive: 'quo'>
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	^(self / aNumber) truncated
!
rem: aNumber
	<primitive: 'rem'>
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	^self - ((self quo: aNumber) * aNumber)
!
abs
	^self < 0 ifTrue: [self negated] ifFalse: [self]
!
negated
	^0 - self
!
reciprocal
	^1 / self
!
squared
	^self * self
!
raisedTo: aNumber
	aNumber isInteger ifTrue: [^self raisedToInteger: aNumber].
	^self asFloat floatPower: aNumber asFloat
!
** aNumber
	^self raisedTo: aNumber
!
raisedToInteger: anInteger
	| result base exponent |
	anInteger < 0 ifTrue: [^(self raisedToInteger: anInteger negated) reciprocal].
	result := 1.
	base := self.
	exponent := anInteger.
	[exponent > 0] whileTrue: [
		exponent odd ifTrue: [result := result * base].
		base := base * base.
		exponent := exponent // 2].
	^result
!
floatPower: aNumber
	<primitive: 'floatPower'>
	^self error: 'Cannot raise ', self printString, ' to ', aNumber printString
! !

!Number methodsFor: 'comparing'!
< aNumber
	<primitive: 'lt'>
	^self retry: #< coercing: aNumber
!
> aNumber
	<primitive: 'gt'>
	^self retry: #> coercing: aNumber
!
<= aNumber
	<primitive: 'le'>
	^self retry: #<= coercing: aNumber
!
>= aNumber
	<primitive: 'ge'>
	^self retry: #>= coercing: aNumber
!
= aNumber
	<primitive: 'eq'>
	aNumber isNumber ifFalse: [^false].
	^self retry: #= coercing: aNumber
!
~= aNumber
	^(self = aNumber) not
!
hash
	<primitive: 'numberHash'>
	^0
! !

!Number methodsFor: 'mathematical functions'!
sqrt
	<primitive: 'sqrt'>
	self < 0 ifTrue: [^self error: 'There is no real square root of ', self printString].
	^self asFloat sqrt
!
sin
	<primitive: 'sin'>
	^self asFloat sin
!
cos
	<primitive: 'cos'>
	^self asFloat cos
!
tan
	<primitive: 'tan'>
	^self asFloat tan
!
arcTan
	<primitive: 'arcTan'>
	^self asFloat arcTan
!
arcSin
	<primitive: 'arcSin'>
	^self asFloat arcSin
!
arcCos
	<primitive: 'arcCos'>
	^self asFloat arcCos
!
ln
	<primitive: 'ln'>
	self <= 0 ifTrue: [^self error: 'There is no logarithm of ', self printString].
	^self asFloat ln
!
log
	<primitive: 'log10'>
	self <= 0 ifTrue: [^self error: 'There is no logarithm of ', self printString].
	^self asFloat log
!
log: aNumber
	^self ln / aNumber ln
!
exp
	<primitive: 'exp'>
	^self asFloat exp
!
degreesToRadians
	^self asFloat * Float pi / 180
!
radiansToDegrees
	^self asFloat * 180 / Float pi
! !

!Number methodsFor: 'truncation and rounding'!
truncated
	<primitive: 'truncated'>
	^self subclassResponsibility
!
floor
	<primitive: 'floor'>
	| t |
	t := self truncated.
	(self < 0 and: [self ~= t]) ifTrue: [^t - 1].
	^t
!
ceiling
	<primitive: 'ceiling'>
	| t |
	t := self truncated.
	(self > 0 and: [self ~= t]) ifTrue: [^t + 1].
	^t
!
rounded
	<primitive: 'rounded'>
	^(self + (self sign / 2)) truncated
!
roundTo: aNumber
	^(self / aNumber) rounded * aNumber
!
truncateTo: aNumber
	^(self quo: aNumber) * aNumber
!
asInteger
	^self truncated
!
asFloat
	<primitive: 'asFloat'>
	^self subclassResponsibility
!
asNumber
	^self
! !

!Number methodsFor: 'intervals'!
to: stop
	^Interval from: self to: stop
!
to: stop by: step
	^Interval from: self to: stop by: step
!
to: stop do: aBlock
	| i |
	i := self.
	[i <= stop] whileTrue: [aBlock value: i. i := i + 1]
!
to: stop by: step do: aBlock
	| i |
	step = 0 ifTrue: [^self error: 'The step must not be zero'].
	i := self.
	step > 0
		ifTrue: [[i <= stop] whileTrue: [aBlock value: i. i := i + step]]
		ifFalse: [[i >= stop] whileTrue: [aBlock value: i. i := i + step]]
!
to: stop collect: aBlock
	^(self to: stop) collect: aBlock
! !

!Number methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self printString
!
printString: base
	^self printString
!
displayString
	^self printString
!
asString
	^self printString
! !

!Integer methodsFor: 'testing'!
isInteger
	^true
!
even
	^(self bitAnd: 1) = 0
!
isPrime
	| i |
	self < 2 ifTrue: [^false].
	i := 2.
	[i * i <= self] whileTrue: [
		self \\ i = 0 ifTrue: [^false].
		i := i + 1].
	^true
! !

!Integer methodsFor: 'coercing'!
generality
	^10
!
coerce: aNumber
	^aNumber truncated
!
numerator
	^self
!
denominator
	^1
!
asInteger
	^self
!
truncated
	^self
!
asCharacter
	<primitive: 'asCharacter'>
	^self error: self printString, ' is not a character value'
! !

!Integer methodsFor: 'arithmetic'!
gcd: anInteger
	<primitive: 'gcd'>
	^self error: 'gcd: takes an integer'
!
lcm: anInteger
	^(self // (self gcd: anInteger) * anInteger) abs
!
factorial
	| result |
	self < 0 ifTrue: [^self error: 'There is no factorial of a negative number'].
	result := 1.
	2 to: self do: [:i | result := result * i].
	^result
!
timesRepeat: aBlock
	| i |
	i := 1.
	[i <= self] whileTrue: [aBlock value. i := i + 1]
!
atRandom
	^Random new between: 1 and: self
! !

!Integer methodsFor: 'bit manipulation'!
bitAnd: anInteger
	<primitive: 'bitAnd'>
	^self error: 'bitAnd: takes an integer'
!
bitOr: anInteger
	<primitive: 'bitOr'>
	^self error: 'bitOr: takes an integer'
!
bitXor: anInteger
	<primitive: 'bitXor'>
	^self error: 'bitXor: takes an integer'
!
bitShift: anInteger
	<primitive: 'bitShift'>
	^self error: 'bitShift: takes a small integer'
!
<< anInteger
	^self bitShift: anInteger
!
>> anInteger
	^self bitShift: anInteger negated
! !

!Integer methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: (self printString: 10)
!
printString
	^self printString: 10
!
printString: base
	<primitive: 'printBase'>
	^self error: 'A base must be 2 to 36'
!
radix: base
	^self printString: base
!
printStringHex
	^self printString: 16
!
printPaddedWith: aCharacter to: aWidth
	| digits |
	digits := self printString.
	digits size >= aWidth ifTrue: [^digits].
	^(String new: aWidth - digits size withAll: aCharacter), digits
! !

!SmallInteger class methodsFor: 'constants'!
maxVal
	"The largest integer a JavaScript number holds exactly; one more is a LargePositiveInteger."
	^9007199254740991
!
minVal
	^-9007199254740991
! !

!Float class methodsFor: 'constants'!
constant: aSymbol
	<primitive: 'floatConstant'>
	^self error: 'There is no Float constant ', aSymbol printString
!
pi
	^self constant: #pi
!
e
	^self constant: #e
!
infinity
	^self constant: #infinity
!
negativeInfinity
	^self constant: #negativeInfinity
!
nan
	^self constant: #nan
!
epsilon
	^self constant: #epsilon
! !

!Float methodsFor: 'testing'!
isFloat
	^true
!
isNaN
	<primitive: 'isNaN'>
	^false
!
isInfinite
	<primitive: 'isInfinite'>
	^false
! !

!Float methodsFor: 'coercing'!
generality
	^30
!
coerce: aNumber
	^aNumber asFloat
!
asFloat
	^self
!
fractionPart
	<primitive: 'fractionPart'>
	^self - self truncated
!
truncated
	<primitive: 'truncated'>
	^self error: self printString, ' has no integer part'
! !

!Float methodsFor: 'copying'!
shallowCopy
	^self
! !

!Float methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self printString
!
printString
	<primitive: 'floatPrint'>
	^'a Float'
! !

!Fraction class methodsFor: 'instance creation'!
numerator: anInteger denominator: anotherInteger
	^self basicNew setNumerator: anInteger denominator: anotherInteger
! !

!Fraction methodsFor: 'private'!
setNumerator: anInteger denominator: anotherInteger
	anotherInteger = 0 ifTrue: [^ZeroDivide new signal: 'A fraction cannot have a zero denominator'].
	numerator := anInteger.
	denominator := anotherInteger
!
normalized
	| gcd n d |
	gcd := numerator gcd: denominator.
	n := numerator // gcd.
	d := denominator // gcd.
	d < 0 ifTrue: [n := n negated. d := d negated].
	d = 1 ifTrue: [^n].
	numerator := n.
	denominator := d
! !

!Fraction methodsFor: 'accessing'!
numerator
	^numerator
!
denominator
	^denominator
! !

!Fraction methodsFor: 'testing'!
isFraction
	^true
!
isLiteral
	^false
! !

!Fraction methodsFor: 'coercing'!
generality
	^20
!
coerce: aNumber
	^Fraction numerator: aNumber denominator: 1
!
asFloat
	^numerator asFloat / denominator asFloat
!
truncated
	^numerator quo: denominator
! !

!Fraction methodsFor: 'arithmetic'!
isRational: aNumber
	^aNumber isInteger or: [aNumber isFraction]
!
+ aNumber
	(self isRational: aNumber) ifFalse: [^self retry: #+ coercing: aNumber].
	^(Fraction
		numerator: (numerator * aNumber denominator) + (aNumber numerator * denominator)
		denominator: denominator * aNumber denominator) normalized
!
- aNumber
	(self isRational: aNumber) ifFalse: [^self retry: #- coercing: aNumber].
	^(Fraction
		numerator: (numerator * aNumber denominator) - (aNumber numerator * denominator)
		denominator: denominator * aNumber denominator) normalized
!
* aNumber
	(self isRational: aNumber) ifFalse: [^self retry: #* coercing: aNumber].
	^(Fraction
		numerator: numerator * aNumber numerator
		denominator: denominator * aNumber denominator) normalized
!
/ aNumber
	(self isRational: aNumber) ifFalse: [^self retry: #/ coercing: aNumber].
	aNumber = 0 ifTrue: [^ZeroDivide new signal: 'Division by zero'].
	^(Fraction
		numerator: numerator * aNumber denominator
		denominator: denominator * aNumber numerator) normalized
!
negated
	^Fraction numerator: numerator negated denominator: denominator
! !

!Fraction methodsFor: 'comparing'!
< aNumber
	(self isRational: aNumber) ifFalse: [^self retry: #< coercing: aNumber].
	^(numerator * aNumber denominator) < (aNumber numerator * denominator)
!
> aNumber
	^aNumber < self
!
<= aNumber
	^(aNumber < self) not
!
>= aNumber
	^(self < aNumber) not
!
= aNumber
	aNumber isNumber ifFalse: [^false].
	(self isRational: aNumber) ifFalse: [^self retry: #= coercing: aNumber].
	^numerator = aNumber numerator and: [denominator = aNumber denominator]
!
hash
	^numerator hash bitXor: denominator hash
! !

!Fraction methodsFor: 'printing'!
printOn: aStream
	aStream nextPut: $(; print: numerator; nextPut: $/; print: denominator; nextPut: $)
!
printString
	| stream |
	stream := WriteStream on: (String new: 16).
	self printOn: stream.
	^stream contents
! !
