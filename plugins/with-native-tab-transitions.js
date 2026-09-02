const fs = require("node:fs/promises");
const path = require("node:path");

const { createRunOncePlugin, withDangerousMod } = require("expo/config-plugins");

const PLUGIN_NAME = "with-native-tab-transitions";
const PLUGIN_VERSION = "1.0.0";
const SUPPORTED_RNSCREENS_VERSION = /^4\.26\./;

const ANIMATOR_MARKER = "PFLEGESHIFT_NATIVE_TAB_TRANSITION_ANIMATOR";
const DELEGATE_MARKER = "PFLEGESHIFT_NATIVE_TAB_TRANSITION_DELEGATE";

const ANIMATOR_ANCHOR =
  "#define RNS_MORE_NAVIGATION_CONTROLLER_AVAILABLE !TARGET_OS_TV && !TARGET_OS_VISION";
const DELEGATE_ANCHOR = "#pragma mark - UINavigationControllerDelegate";

const ANIMATOR_SOURCE = String.raw`

// PFLEGESHIFT_NATIVE_TAB_TRANSITION_ANIMATOR
// Mirrors the native iOS push language used by LUNA Shift detail screens while
// keeping UITabBarController's system tab bar outside the animated content area.
#import <QuartzCore/QuartzCore.h>

static const NSTimeInterval kPflegeShiftTabTransitionDuration = 0.40;
static const CGFloat kPflegeShiftTabTransitionParallax = 0.30;
static const CGFloat kPflegeShiftTabTransitionDimAlpha = 0.18;
static const CGFloat kPflegeShiftTabTransitionShadowWidth = 18.0;

@interface PflegeShiftTabTransitionAnimator : NSObject <UIViewControllerAnimatedTransitioning>

- (instancetype)initWithForwardDirection:(BOOL)movingForward;

@property (nonatomic, readonly) BOOL movingForward;

@end

@implementation PflegeShiftTabTransitionAnimator

- (instancetype)initWithForwardDirection:(BOOL)movingForward
{
  if (self = [super init]) {
    _movingForward = movingForward;
  }
  return self;
}

- (NSTimeInterval)transitionDuration:(nullable id<UIViewControllerContextTransitioning>)transitionContext
{
  return kPflegeShiftTabTransitionDuration;
}

- (void)animateTransition:(id<UIViewControllerContextTransitioning>)transitionContext
{
  UIViewController *fromViewController =
      [transitionContext viewControllerForKey:UITransitionContextFromViewControllerKey];
  UIViewController *toViewController =
      [transitionContext viewControllerForKey:UITransitionContextToViewControllerKey];
  UIView *fromView = [transitionContext viewForKey:UITransitionContextFromViewKey];
  UIView *toView = [transitionContext viewForKey:UITransitionContextToViewKey];

  if (fromViewController == nil || toViewController == nil || fromView == nil || toView == nil) {
    [transitionContext completeTransition:NO];
    return;
  }

  UIView *containerView = transitionContext.containerView;
  CGRect finalFrame = [transitionContext finalFrameForViewController:toViewController];
  CGFloat sceneWidth = CGRectGetWidth(containerView.bounds);
  if (sceneWidth <= 0) {
    sceneWidth = CGRectGetWidth(finalFrame);
  }

  fromView.transform = CGAffineTransformIdentity;
  toView.frame = finalFrame;

  UIView *dimView = [[UIView alloc] initWithFrame:toView.bounds];
  dimView.userInteractionEnabled = NO;
  dimView.backgroundColor = UIColor.blackColor;
  dimView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

  UIView *shadowHostView;
  if (self.movingForward) {
    toView.transform = CGAffineTransformMakeTranslation(sceneWidth, 0);
    [containerView addSubview:toView];

    dimView.frame = fromView.bounds;
    dimView.alpha = 0;
    [fromView addSubview:dimView];
    shadowHostView = toView;
  } else {
    toView.transform = CGAffineTransformMakeTranslation(
        -sceneWidth * kPflegeShiftTabTransitionParallax, 0);
    [containerView insertSubview:toView belowSubview:fromView];

    dimView.alpha = kPflegeShiftTabTransitionDimAlpha;
    [toView addSubview:dimView];
    shadowHostView = fromView;
  }

  CAGradientLayer *shadowLayer = [CAGradientLayer layer];
  shadowLayer.frame = CGRectMake(
      0, 0, kPflegeShiftTabTransitionShadowWidth, CGRectGetHeight(shadowHostView.bounds));
  shadowLayer.colors = @[
    (id)[UIColor colorWithWhite:0 alpha:0.24].CGColor,
    (id)UIColor.clearColor.CGColor,
  ];
  shadowLayer.startPoint = CGPointMake(0, 0.5);
  shadowLayer.endPoint = CGPointMake(1, 0.5);
  [shadowHostView.layer addSublayer:shadowLayer];

  UICubicTimingParameters *timingParameters = [[UICubicTimingParameters alloc]
      initWithControlPoint1:CGPointMake(0.22, 1.0)
             controlPoint2:CGPointMake(0.36, 1.0)];
  UIViewPropertyAnimator *animator = [[UIViewPropertyAnimator alloc]
      initWithDuration:[self transitionDuration:transitionContext]
       timingParameters:timingParameters];

  [animator addAnimations:^{
    if (self.movingForward) {
      fromView.transform = CGAffineTransformMakeTranslation(
          -sceneWidth * kPflegeShiftTabTransitionParallax, 0);
      dimView.alpha = kPflegeShiftTabTransitionDimAlpha;
    } else {
      fromView.transform = CGAffineTransformMakeTranslation(sceneWidth, 0);
      dimView.alpha = 0;
    }
    toView.transform = CGAffineTransformIdentity;
  }];

  [animator addCompletion:^(UIViewAnimatingPosition finalPosition) {
    BOOL didComplete = !transitionContext.transitionWasCancelled;
    fromView.transform = CGAffineTransformIdentity;
    toView.transform = CGAffineTransformIdentity;
    [dimView removeFromSuperview];
    [shadowLayer removeFromSuperlayer];
    [transitionContext completeTransition:didComplete];
  }];

  [animator startAnimation];
}

@end
`;

const DELEGATE_SOURCE = String.raw`
// PFLEGESHIFT_NATIVE_TAB_TRANSITION_DELEGATE
- (nullable id<UIViewControllerAnimatedTransitioning>)
    tabBarController:(UITabBarController *)tabBarController
    animationControllerForTransitionFromViewController:(UIViewController *)fromViewController
    toViewController:(UIViewController *)toViewController
{
  RCTAssert(tabBarController == self, @"[LUNA Shift] Unexpected tab bar controller instance");

  if (UIAccessibilityIsReduceMotionEnabled()) {
    return nil;
  }

  NSUInteger fromIndex = [self.viewControllers indexOfObjectIdenticalTo:fromViewController];
  NSUInteger toIndex = [self.viewControllers indexOfObjectIdenticalTo:toViewController];
  if (fromIndex == NSNotFound || toIndex == NSNotFound || fromIndex == toIndex) {
    return nil;
  }

  return [[PflegeShiftTabTransitionAnimator alloc]
      initWithForwardDirection:toIndex > fromIndex];
}

`;

function assertSupportedVersion(version) {
  if (!SUPPORTED_RNSCREENS_VERSION.test(version)) {
    throw new Error(
      `[${PLUGIN_NAME}] react-native-screens ${version} is unsupported. ` +
        "Revalidate the native tab transition patch before upgrading beyond 4.26.x.",
    );
  }
}

function applyNativeTabTransitionPatch(source) {
  const hasAnimator = source.includes(ANIMATOR_MARKER);
  const hasDelegate = source.includes(DELEGATE_MARKER);

  if (hasAnimator && hasDelegate) {
    return source;
  }
  if (hasAnimator || hasDelegate) {
    throw new Error(`[${PLUGIN_NAME}] Found an incomplete existing native tab transition patch.`);
  }
  if (!source.includes(ANIMATOR_ANCHOR) || !source.includes(DELEGATE_ANCHOR)) {
    throw new Error(
      `[${PLUGIN_NAME}] react-native-screens anchors changed. Revalidate the iOS patch before building.`,
    );
  }

  return source
    .replace(ANIMATOR_ANCHOR, `${ANIMATOR_ANCHOR}${ANIMATOR_SOURCE}`)
    .replace(DELEGATE_ANCHOR, `${DELEGATE_SOURCE}${DELEGATE_ANCHOR}`);
}

function withNativeTabTransitions(config) {
  return withDangerousMod(config, [
    "ios",
    async (configWithMod) => {
      const projectRoot = configWithMod.modRequest.projectRoot;
      const packageJsonPath = require.resolve("react-native-screens/package.json", {
        paths: [projectRoot],
      });
      const packageRoot = path.dirname(packageJsonPath);
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
      assertSupportedVersion(packageJson.version);

      const sourcePath = path.join(packageRoot, "ios", "tabs", "host", "RNSTabBarController.mm");
      const source = await fs.readFile(sourcePath, "utf8");
      const patchedSource = applyNativeTabTransitionPatch(source);

      if (patchedSource !== source) {
        await fs.writeFile(sourcePath, patchedSource, "utf8");
      }

      return configWithMod;
    },
  ]);
}

module.exports = createRunOncePlugin(withNativeTabTransitions, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.applyNativeTabTransitionPatch = applyNativeTabTransitionPatch;
module.exports.assertSupportedVersion = assertSupportedVersion;
module.exports.markers = Object.freeze({ animator: ANIMATOR_MARKER, delegate: DELEGATE_MARKER });
